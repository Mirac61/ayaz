package app

import "testing"

// Switching folders rebinds the window to another workspace; the close button must then ask about that one,
// or the frontend (which only answers for the workspace it shows) drops the request and the window never closes.
func TestCloseRequestNamesTheCurrentWorkspace(t *testing.T) {
	s := NewWorkspaceService(nil)
	s.windows[7] = "first"
	if ws, ask := s.closeRequest(7); ws != "first" || !ask {
		t.Fatalf("closeRequest = %q, %v; want first, true", ws, ask)
	}

	s.windows[7] = "second" // what bindWindow does on a folder switch in an already hooked window
	if ws, ask := s.closeRequest(7); ws != "second" || !ask {
		t.Fatalf("after the switch closeRequest = %q, %v; want second, true", ws, ask)
	}
}

func TestCloseRequestLetsAConfirmedCloseThrough(t *testing.T) {
	s := NewWorkspaceService(nil)
	s.windows[7] = "ws"
	s.closing[7] = true
	if _, ask := s.closeRequest(7); ask {
		t.Fatal("a window CloseWindow already confirmed must not be asked again")
	}
}
