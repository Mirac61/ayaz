package workspace

/*
#cgo CFLAGS: -x objective-c -fobjc-arc
#cgo LDFLAGS: -framework Foundation
#import <Foundation/Foundation.h>
#include <stdlib.h>

// Moves path to the Trash like Finder, so "Put Back" knows where it came from.
// Returns the path in the Trash, or "!" and the reason; the caller frees it.
static char *trashItem(const char *path) {
	@autoreleasepool {
		NSURL *url = [NSURL fileURLWithPath:[NSString stringWithUTF8String:path]];
		NSURL *to = nil;
		NSError *err = nil;
		if (![[NSFileManager defaultManager] trashItemAtURL:url resultingItemURL:&to error:&err])
			return strdup([[@"!" stringByAppendingString:err.localizedDescription] UTF8String]);
		return strdup(to.path ? to.path.UTF8String : ""); // "": trashed, but no place reported
	}
}
*/
import "C"

import (
	"errors"
	"strings"
	"unsafe"
)

func trash(p string) error {
	_, err := trashItem(p)
	return err
}

// trashItem returns where the item went in the Trash.
func trashItem(p string) (string, error) {
	cp := C.CString(p)
	defer C.free(unsafe.Pointer(cp))
	out := C.trashItem(cp)
	defer C.free(unsafe.Pointer(out))
	s := C.GoString(out)
	if msg, failed := strings.CutPrefix(s, "!"); failed {
		return "", errors.New(msg)
	}
	return s, nil
}
