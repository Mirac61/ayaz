package app

/*
#cgo CFLAGS: -x objective-c -fobjc-arc
#cgo LDFLAGS: -framework WebKit
#import <WebKit/WebKit.h>

// WebKit caps requestAnimationFrame at 60 fps by default, even on 120 Hz ProMotion displays.
// The switch is the internal feature "PreferPageRenderingUpdatesNear60FPSEnabled"
// (Safari: Develop > Feature Flags). It is private API, so look it up defensively.
static int uncapFrameRate(void *nsWindow) {
	WKWebView *webView = [(__bridge id)nsWindow valueForKey:@"webView"];
	WKPreferences *prefs = webView.configuration.preferences;
	SEL list = NSSelectorFromString(@"_features");
	SEL set = NSSelectorFromString(@"_setEnabled:forFeature:");
	if (![WKPreferences respondsToSelector:list] || ![prefs respondsToSelector:set]) return 0;
	for (id feature in [WKPreferences performSelector:list]) {
		if (![[feature valueForKey:@"key"] isEqualToString:@"PreferPageRenderingUpdatesNear60FPSEnabled"]) continue;
		void (*setEnabled)(id, SEL, BOOL, id) = (void *)[prefs methodForSelector:set];
		setEnabled(prefs, set, NO, feature);
		return 1;
	}
	return 0;
}
*/
import "C"

import (
	"log"

	"github.com/wailsapp/wails/v3/pkg/application"
)

// UncapFrameRate lets the WebView render at the display's refresh rate (120 Hz on ProMotion).
func UncapFrameRate(w *application.WebviewWindow) {
	application.InvokeSync(func() {
		if C.uncapFrameRate(w.NativeWindow()) == 0 {
			log.Println("framerate: WebKit 60 fps switch not found, staying at 60 fps")
		}
	})
}
