package index

import (
	"math"
	"sort"
	"strings"
	"unicode"
)

type Match struct {
	Path      string `json:"path"`
	Score     int    `json:"score"`
	Positions []int  `json:"positions"` // rune indices into Path, ascending
}

// Scoring weights; rankings are pinned by the golden tests, change them together.
const (
	scoreChar     = 16
	bonusStart    = 10 // first char, or right after "/"
	bonusSep      = 8  // after "_", "-", ".", " "
	bonusCamel    = 7  // lower → upper
	bonusBase     = 4  // inside the file name
	bonusConsec   = 6  // right after the previous match
	penaltyGap    = 3  // opening a gap
	penaltyGapExt = 1  // each further skipped char
)

const minScore = math.MinInt32 / 2

// Find returns up to limit paths that contain the query as a subsequence, best first.
// Spaces in the query are ignored. Smart case: an upper-case letter makes it case-sensitive.
func (ix *Index) Find(query string, limit int) []Match {
	query = strings.ReplaceAll(query, " ", "")
	if query == "" {
		n := min(limit, len(ix.paths))
		out := make([]Match, n)
		for i := range out {
			out[i] = Match{Path: ix.paths[i], Positions: []int{}}
		}
		return out
	}
	exact := query != strings.ToLower(query)
	q := []rune(query)
	if !exact {
		q = []rune(strings.Map(unicode.ToLower, query))
	}
	var hits []Match
	for i, p := range ix.paths {
		hay := ix.lower[i]
		if exact {
			hay = p
		}
		if !subseq(hay, q) {
			continue
		}
		if m, ok := score(p, q, exact); ok {
			hits = append(hits, m)
		}
	}
	sort.Slice(hits, func(i, j int) bool {
		a, b := hits[i], hits[j]
		if a.Score != b.Score {
			return a.Score > b.Score
		}
		if len(a.Path) != len(b.Path) {
			return len(a.Path) < len(b.Path)
		}
		return a.Path < b.Path
	})
	if len(hits) > limit {
		hits = hits[:limit]
	}
	return hits
}

func subseq(hay string, q []rune) bool {
	i := 0
	for _, r := range hay {
		if i < len(q) && r == q[i] {
			i++
		}
	}
	return i == len(q)
}

// score finds the best alignment of q in path (Smith-Waterman-like, affine gaps), O(len(q)·len(path)).
func score(path string, q []rune, exact bool) (Match, bool) {
	p := []rune(path)
	n, m := len(p), len(q)
	base := strings.LastIndexByte(path, '/') + 1 // byte index; convert to runes
	base = len([]rune(path[:base]))

	bonus := make([]int, n)
	for j, r := range p {
		switch {
		case j == 0 || p[j-1] == '/':
			bonus[j] = bonusStart
		case strings.ContainsRune("_-. ", p[j-1]):
			bonus[j] = bonusSep
		case unicode.IsLower(p[j-1]) && unicode.IsUpper(r):
			bonus[j] = bonusCamel
		}
		if j >= base {
			bonus[j] += bonusBase
		}
	}

	// s[i*n+j]: best score with q[i] matched at p[j]; from[i*n+j]: where q[i-1] was matched.
	s := make([]int, m*n)
	from := make([]int32, m*n)
	for i := range m {
		best, bestAt := minScore, int32(-1) // best predecessor in row i-1 with a gap, gap cost included
		for j := range n {
			cell := minScore
			if i > 0 && j >= 2 {
				if prev := s[(i-1)*n+j-2] - penaltyGap; prev > best-penaltyGapExt {
					best, bestAt = prev, int32(j-2)
				} else {
					best -= penaltyGapExt
				}
			}
			if eq(p[j], q[i], exact) {
				switch {
				case i == 0:
					cell = scoreChar + bonus[j]
				default:
					if j >= 1 && s[(i-1)*n+j-1] > minScore {
						cell = s[(i-1)*n+j-1] + bonusConsec
						from[i*n+j] = int32(j - 1)
					}
					if bestAt >= 0 && best > cell {
						cell = best
						from[i*n+j] = bestAt
					}
					if cell > minScore {
						cell += scoreChar + bonus[j]
					}
				}
			}
			s[i*n+j] = cell
		}
	}

	end, top := -1, minScore
	for j := range n {
		if v := s[(m-1)*n+j]; v > top {
			end, top = j, v
		}
	}
	if end < 0 {
		return Match{}, false
	}
	pos := make([]int, m)
	for i, j := m-1, end; i >= 0; i-- {
		pos[i] = j
		j = int(from[i*n+j])
	}
	return Match{Path: path, Score: top, Positions: pos}, true
}

func eq(a, b rune, exact bool) bool {
	if exact {
		return a == b
	}
	return unicode.ToLower(a) == b
}
