package git

import (
	"os"
	"path/filepath"
	"slices"
	"testing"
)

func TestSummarizeListsUntrackedFilesAndWorktreeRenames(t *testing.T) {
	root := repo(t)
	write(t, filepath.Join(root, "new", "a.txt"), "a\n")
	write(t, filepath.Join(root, "new", "b.txt"), "b\n")
	// `git add -N` after a rename gives " R": the old path follows as its own field and must not be read as a file.
	if err := os.Rename(filepath.Join(root, "a.txt"), filepath.Join(root, "third.txt")); err != nil {
		t.Fatal(err)
	}
	gitIn(t, root, "add", "-N", "third.txt")

	s, err := Summarize(root)
	if err != nil {
		t.Fatal(err)
	}
	for _, want := range []string{"new/a.txt", "new/b.txt", "third.txt"} {
		if !slices.Contains(s.Changed, want) {
			t.Errorf("Changed = %v, missing %q", s.Changed, want)
		}
	}
	for _, c := range s.Changed {
		if c == "new/" || c == "a.txt" || c == "st.txt" {
			t.Errorf("Changed = %v, unexpected %q", s.Changed, c)
		}
	}
}
