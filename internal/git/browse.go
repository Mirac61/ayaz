package git

import (
	"errors"
	"net/url"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
)

// scp-like remote: git@github.com:owner/repo.git
var scpRemote = regexp.MustCompile(`^(?:[^@/\s]+@)?([^:/\s]+):/?(.+)$`)

// escPath percent-encodes each segment of a path and keeps the slashes.
func escPath(p string) string {
	parts := strings.Split(p, "/")
	for i, s := range parts {
		parts[i] = url.PathEscape(s)
	}
	return strings.Join(parts, "/")
}

// webURL is the page of rel at ref in the web view of the remote, at line (0: no anchor). Credentials in the remote
// (https://token@host/…) are dropped, and no error carries the remote's text.
// shortcut: GitHub's URL shape; GitLab redirects it, Bitbucket needs its own
func webURL(remote, ref, rel string, line int) (string, error) {
	var host, repo string
	remote = strings.TrimSpace(remote)
	if u, err := url.Parse(remote); err == nil && u.Scheme != "" && u.Host != "" {
		switch u.Scheme {
		case "https", "http":
			host = u.Host
		case "ssh", "git", "git+ssh", "ssh+git":
			host = u.Hostname() // the ssh port is not the web port
		}
		repo = u.Path
	} else if m := scpRemote.FindStringSubmatch(remote); m != nil && !strings.Contains(remote, "://") {
		host, repo = m[1], m[2]
	}
	repo = strings.TrimSuffix(strings.Trim(repo, "/"), ".git")
	if host == "" || !strings.Contains(repo, "/") {
		return "", errors.New("the origin remote is not a web address git understands (https or ssh, host/owner/repo)")
	}
	out := "https://" + host + "/" + escPath(repo) + "/blob/" + escPath(ref) + "/" + escPath(filepath.ToSlash(rel))
	if line > 0 {
		out += "#L" + strconv.Itoa(line)
	}
	return out, nil
}

// BrowseURL is rel (relative to root, which may be a subfolder of the repository) on the web view of origin: at the
// current branch, or with permalink at the commit HEAD points to. Whether that is pushed is not checked.
func BrowseURL(root, rel string, line int, permalink bool) (string, error) {
	out, ok, err := run(root, "remote", "get-url", "origin")
	if err != nil {
		return "", err
	}
	if !ok {
		return "", errors.New("no remote named origin")
	}
	remote := strings.TrimSpace(string(out))
	var ref string
	if permalink {
		out, ok, err := run(root, "rev-parse", "HEAD")
		if err != nil || !ok {
			return "", errors.New("no commit yet")
		}
		ref = strings.TrimSpace(string(out))
	} else if ref, err = Branch(root); err != nil || ref == "" {
		return "", errors.New("no commit yet")
	}
	out, _, err = run(root, "rev-parse", "--show-prefix")
	if err != nil {
		return "", err
	}
	return webURL(remote, ref, strings.TrimSuffix(string(out), "\n")+filepath.ToSlash(rel), line)
}
