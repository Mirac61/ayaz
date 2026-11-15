package app

import (
	"testing"
	"time"
)

func TestHistoryKeepsNewestVersions(t *testing.T) {
	t.Setenv("AYAZ_CACHE_DIR", t.TempDir())
	if vs, err := versions("/p", "a.go"); err != nil || len(vs) != 0 {
		t.Fatalf("no history yet: %v, %v", vs, err)
	}
	start := time.UnixMilli(1_000_000)
	for i := range historyKeep + 5 {
		if err := keepVersion("/p", "a.go", "v"+string(rune('A'+i)), start.Add(time.Duration(i)*time.Second)); err != nil {
			t.Fatal(err)
		}
	}
	vs, err := versions("/p", "a.go")
	if err != nil || len(vs) != historyKeep {
		t.Fatalf("versions = %d, %v", len(vs), err)
	}
	newest := start.Add(time.Duration(historyKeep+4) * time.Second).UnixMilli()
	if vs[0].Time != newest || vs[0].Size != 2 {
		t.Fatalf("newest = %+v, want time %d", vs[0], newest)
	}
	if text, err := versionText("/p", "a.go", vs[0].Time); err != nil || text != "v"+string(rune('A'+historyKeep+4)) {
		t.Fatalf("versionText = %q, %v", text, err)
	}
	if oldest := vs[len(vs)-1].Time; oldest != start.Add(5*time.Second).UnixMilli() {
		t.Fatalf("oldest kept = %d", oldest)
	}
	if vs, _ := versions("/p", "b.go"); len(vs) != 0 {
		t.Fatalf("other file has history: %v", vs)
	}
}

func TestHistorySkipsUnchangedAndBigFiles(t *testing.T) {
	t.Setenv("AYAZ_CACHE_DIR", t.TempDir())
	keepOld("/p", "a.go", "same", "same")
	keepOld("/p", "big.go", string(make([]byte, historyMaxSize+1)), "small")
	keepOld("/p", "c.go", "old", "new")
	for path, want := range map[string]int{"a.go": 0, "big.go": 0, "c.go": 1} {
		if vs, _ := versions("/p", path); len(vs) != want {
			t.Errorf("%s: %d versions, want %d", path, len(vs), want)
		}
	}
}
