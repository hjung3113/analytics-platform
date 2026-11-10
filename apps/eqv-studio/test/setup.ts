import { configure } from '@testing-library/react';

// Page tests do real file I/O and render Radix-based @ap/ui controls; under full-suite CI load one wait can pass
// the 1 s default (EV#88).
configure({ asyncUtilTimeout: 5000 });

// jsdom 26 (the AP version) has no Blob/File `text()`; the import and layout screens read uploads with it.
if (typeof Blob.prototype.text !== 'function') {
  Blob.prototype.text = function text(this: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(reader.error);
      reader.onload = () => resolve(String(reader.result));
      reader.readAsText(this);
    });
  };
}
