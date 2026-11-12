package git

import (
	"os"
	"path/filepath"
	"testing"
)

func TestActions(t *testing.T) {
	root := repo(t)

	// Initially clean
	st, err := StatusDetailed(root)
	if err != nil {
		t.Fatal(err)
	}
	if len(st) != 0 {
		t.Fatalf("expected clean repo, got %v", st)
	}

	// 1. Modify a file and create an untracked file
	write(t, filepath.Join(root, "a.txt"), "modified\n")
	write(t, filepath.Join(root, "new.txt"), "fresh\n")

	st, err = StatusDetailed(root)
	if err != nil {
		t.Fatal(err)
	}
	if len(st) != 2 {
		t.Fatalf("expected 2 files, got %d", len(st))
	}

	// Check a.txt is modified and unstaged
	var aStatus, newStatus *FileStatus
	for i := range st {
		if st[i].Path == "a.txt" {
			aStatus = &st[i]
		} else if st[i].Path == "new.txt" {
			newStatus = &st[i]
		}
	}
	if aStatus == nil || aStatus.Staged || !aStatus.Unstaged || aStatus.Status != "M" {
		t.Errorf("unexpected a.txt status: %+v", aStatus)
	}
	if newStatus == nil || newStatus.Staged || !newStatus.Unstaged || newStatus.Status != "?" {
		t.Errorf("unexpected new.txt status: %+v", newStatus)
	}

	// 2. Stage a.txt
	if err := StageFile(root, "a.txt"); err != nil {
		t.Fatalf("StageFile a.txt: %v", err)
	}
	st, _ = StatusDetailed(root)
	for i := range st {
		if st[i].Path == "a.txt" {
			aStatus = &st[i]
		}
	}
	if !aStatus.Staged || aStatus.Unstaged {
		t.Errorf("after stage, a.txt should be staged only: %+v", aStatus)
	}

	// 3. Unstage a.txt
	if err := UnstageFile(root, "a.txt"); err != nil {
		t.Fatalf("UnstageFile a.txt: %v", err)
	}
	st, _ = StatusDetailed(root)
	for i := range st {
		if st[i].Path == "a.txt" {
			aStatus = &st[i]
		}
	}
	if aStatus.Staged || !aStatus.Unstaged {
		t.Errorf("after unstage, a.txt should be unstaged: %+v", aStatus)
	}

	// 4. StageAll
	if err := StageAll(root); err != nil {
		t.Fatalf("StageAll: %v", err)
	}
	st, _ = StatusDetailed(root)
	for _, s := range st {
		if !s.Staged || s.Unstaged {
			t.Errorf("all files should be staged: %+v", s)
		}
	}

	// 5. UnstageAll
	if err := UnstageAll(root); err != nil {
		t.Fatalf("UnstageAll: %v", err)
	}
	st, _ = StatusDetailed(root)
	for _, s := range st {
		if s.Staged || !s.Unstaged {
			t.Errorf("all files should be unstaged: %+v", s)
		}
	}

	// 6. DiscardFile on untracked new.txt (should delete it)
	if err := DiscardFile(root, "new.txt"); err != nil {
		t.Fatalf("DiscardFile new.txt: %v", err)
	}
	if _, err := os.Stat(filepath.Join(root, "new.txt")); !os.IsNotExist(err) {
		t.Errorf("new.txt should have been deleted")
	}

	// 7. DiscardFile on modified a.txt (should revert to "a\n")
	if err := DiscardFile(root, "a.txt"); err != nil {
		t.Fatalf("DiscardFile a.txt: %v", err)
	}
	content, _ := os.ReadFile(filepath.Join(root, "a.txt"))
	if string(content) != "a\n" {
		t.Errorf("a.txt not reverted, got %q", string(content))
	}

	// 8. Delete a tracked file and test StatusDetailed detects "D"
	if err := os.Remove(filepath.Join(root, "a.txt")); err != nil {
		t.Fatal(err)
	}
	st, _ = StatusDetailed(root)
	if len(st) != 1 || st[0].Path != "a.txt" || st[0].Status != "D" {
		t.Errorf("expected deleted a.txt with D status, got: %+v", st)
	}

	// Discard on deleted file restores it
	if err := DiscardFile(root, "a.txt"); err != nil {
		t.Fatalf("DiscardFile deleted a.txt: %v", err)
	}
	content, _ = os.ReadFile(filepath.Join(root, "a.txt"))
	if string(content) != "a\n" {
		t.Errorf("a.txt not restored, got %q", string(content))
	}

	// 9. Commit
	write(t, filepath.Join(root, "c.txt"), "hello commit\n")
	if err := StageFile(root, "c.txt"); err != nil {
		t.Fatalf("StageFile c.txt: %v", err)
	}
	if err := Commit(root, "test commit message"); err != nil {
		t.Fatalf("Commit: %v", err)
	}
	st, _ = StatusDetailed(root)
	if len(st) != 0 {
		t.Errorf("expected clean repo after commit, got %+v", st)
	}
	// Empty message should fail
	if err := Commit(root, "   "); err == nil {
		t.Errorf("expected error for empty commit message")
	}
}
