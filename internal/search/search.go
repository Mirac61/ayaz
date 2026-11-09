// Package search greps the files of a workspace's index in parallel and streams the hits (ADR-0016).
package search

import (
	"bytes"
	"context"
	"os"
	"path/filepath"
	"regexp"
	"runtime"
	"sync"
	"unicode"
	"unicode/utf16"
	"unicode/utf8"
)

const (
	maxFileSize = 2 << 20 // bigger files are skipped, like minified bundles and data dumps
	maxText     = 300     // bytes of a hit's line sent to the frontend
	MaxHits     = 10_000  // the search stops after this many
)

// Hit is one match. Line is 1-based; Col and Len count UTF-16 units like CodeMirror, within the line.
type Hit struct {
	Path string `json:"path"`
	Line int    `json:"line"`
	Col  int    `json:"col"`
	Len  int    `json:"len"`
	Text string `json:"text"` // the line, cut at maxText bytes
}

type Options struct {
	Query string `json:"query"`
	Regex bool   `json:"regex"` // Go RE2 syntax; otherwise a literal
}

// Compile turns the options into a regexp. Smart case like Vim: case-insensitive unless the query has an upper-case letter.
func Compile(o Options) (*regexp.Regexp, error) {
	q := o.Query
	if !o.Regex {
		q = regexp.QuoteMeta(q)
	}
	if !hasUpper(o.Query) {
		q = "(?i)" + q
	}
	return regexp.Compile(q)
}

func hasUpper(s string) bool {
	for _, r := range s {
		if unicode.IsUpper(r) {
			return true
		}
	}
	return false
}

// Run searches paths (relative to root, with "/") on one worker per CPU and calls emit with batches of hits,
// one batch per file, from several goroutines at once. It stops at MaxHits or when ctx is done.
func Run(ctx context.Context, root string, paths []string, re *regexp.Regexp, emit func([]Hit)) {
	ctx, cancel := context.WithCancel(ctx)
	defer cancel()
	// A case-sensitive literal lets a file be skipped with bytes.Index before running the regexp per line.
	lit, complete := re.LiteralPrefix()
	if !complete {
		lit = ""
	}
	ch := make(chan string)
	var mu sync.Mutex
	total := 0
	var wg sync.WaitGroup
	for range runtime.GOMAXPROCS(0) {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for p := range ch {
				hits := file(filepath.Join(root, filepath.FromSlash(p)), p, re, lit)
				if len(hits) == 0 {
					continue
				}
				mu.Lock()
				hits = hits[:min(len(hits), MaxHits-total)]
				total += len(hits)
				full := total >= MaxHits
				mu.Unlock()
				if len(hits) > 0 {
					emit(hits)
				}
				if full {
					cancel()
				}
			}
		}()
	}
feed:
	for _, p := range paths {
		select {
		case ch <- p:
		case <-ctx.Done():
			break feed
		}
	}
	close(ch)
	wg.Wait()
}

func file(abs, rel string, re *regexp.Regexp, lit string) []Hit {
	st, err := os.Stat(abs)
	if err != nil || !st.Mode().IsRegular() || st.Size() > maxFileSize {
		return nil
	}
	b, err := os.ReadFile(abs)
	if err != nil || bytes.IndexByte(b[:min(len(b), 8000)], 0) >= 0 { // a NUL byte: binary, like Git decides
		return nil
	}
	if lit != "" && !bytes.Contains(b, []byte(lit)) {
		return nil
	}
	var hits []Hit
	for n := 1; len(b) > 0; n++ {
		line := b
		if i := bytes.IndexByte(b, '\n'); i >= 0 {
			line, b = b[:i], b[i+1:]
		} else {
			b = nil
		}
		line = bytes.TrimSuffix(line, []byte{'\r'})
		for _, m := range re.FindAllIndex(line, -1) {
			if m[0] == m[1] {
				continue // empty matches (e.g. "x*") are noise
			}
			hits = append(hits, Hit{Path: rel, Line: n, Col: u16(line[:m[0]]), Len: u16(line[m[0]:m[1]]), Text: cut(line)})
		}
	}
	return hits
}

// u16 counts UTF-16 units; invalid UTF-8 bytes count as one each (they decode to U+FFFD).
func u16(b []byte) int {
	n := 0
	for len(b) > 0 {
		r, size := utf8.DecodeRune(b)
		n += utf16.RuneLen(r)
		b = b[size:]
	}
	return n
}

// cut shortens a line to maxText bytes without splitting a rune.
func cut(line []byte) string {
	if len(line) <= maxText {
		return string(line)
	}
	i := maxText
	for i > 0 && !utf8.RuneStart(line[i]) {
		i--
	}
	return string(line[:i])
}
