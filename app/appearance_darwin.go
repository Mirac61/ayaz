package app

/*
#cgo CFLAGS: -x objective-c -fobjc-arc
#cgo LDFLAGS: -framework Cocoa
#import <Cocoa/Cocoa.h>

static void setAppearance(void *nsWindow, int light) {
	NSWindow *w = (__bridge NSWindow *)nsWindow;
	w.appearance = [NSAppearance appearanceNamed:light ? NSAppearanceNameAqua : NSAppearanceNameDarkAqua];
}
*/
import "C"

import "github.com/wailsapp/wails/v3/pkg/application"

// setWindowLight sets the window's own appearance. The translucent backdrop is drawn by macOS in that appearance, so
// a dark theme over a light system (or the other way round) would show a grey wash through the glass.
func setWindowLight(w application.Window, light bool) {
	ww, ok := w.(*application.WebviewWindow)
	if !ok {
		return
	}
	l := 0
	if light {
		l = 1
	}
	application.InvokeSync(func() { C.setAppearance(ww.NativeWindow(), C.int(l)) })
}
