// Reviewed against original PDF pages, not reconstructed OCR equations. See docs/lab-evidence.md.
export const ORIGINAL_PDF_SHA256 = '0cb33c989a080dda79f67d4f1c52e914309d795b1584cb909902e838a90b6d58';
export const CHAPTER_PDF_SHA256 = '4c63cba2bec427534c8b8749a0988ebb1f7b9b34811c146fd16e0e5b32980110';
export const EVIDENCE_PINS = [
  { key: 'distance', id: 'b471033f-39e7-4f1c-8872-3cd34d5254a1', hash: 'b5c84a94aefb0ec541f8491b9a0abb67e44b9541e4e76f105723c1884819013b', from: 38, to: 39 },
  { key: 'speed', id: '0438c7b5-b7aa-41bd-8404-0ec46423d23b', hash: 'be0a51bed4dc398314922a88c9d5fe232642ce5233c9d8320e9f88e2f6bd87d4', from: 39, to: 41 },
  { key: 'velocity', id: 'eb8ac212-6aac-4c96-bef9-d63469e3127a', hash: 'b33d757509716d8613e0c24e9b6ff4e9ff2b3944b24b35d586cddbe60ba35ba5', from: 43, to: 45 },
  { key: 'averages', id: '12356d4c-92ee-4baf-85d7-8622eda66c40', hash: 'dda7b134e43a134f9ba0e71ea4d8ee8691d847adc90820ea9fc9a3e94093e2de', from: 45, to: 46 },
  { key: 'acceleration', id: '7e6f3ba0-4820-4763-81e9-4f95e6bce976', hash: '55cea2bcce2412c1fda6f65412e74e503d7691e92af65aac8ea6b26934ceb6aa', from: 46, to: 47 },
  { key: 'graphs', id: '51dca613-6f74-465e-a00a-0d4f93140f3c', hash: '1797e9544419dc0308a0a2b0a708c966714a33adc8522a7eef78bae99f3c35a4', from: 49, to: 52 },
  { key: 'velocity-graph', id: 'de56ca2a-3fdc-41e6-9afa-63e009487829', hash: '516478e938d91cde2e7c79d9077e0a391cf58a679f3cc9ecc3b76fb365a12caa', from: 53, to: 55 },
] as const;
