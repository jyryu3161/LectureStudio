/**
 * Scoped global CSS for Lecture Mode, injected only while the stage is mounted
 * (globals.css is frozen this loop, so print + chrome rules live here).
 *
 * On screen: hides the shared app rail for a fullscreen presentation feel --
 * the toolbar's "나가기" button is the way back to Reading Mode.
 *
 * On print (window.print() / "PDF로 내보내기"): hides all chrome (rail,
 * toolbar, TOC, panel) and un-clips the scroll container so the whole
 * annotated chapter flows across pages. SVG ink overlays print because we
 * force `print-color-adjust: exact` on them, so the pen/highlighter colors
 * survive the browser's default "economy" color stripping.
 */
export function LectureChromeStyle() {
  return (
    <style
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{
        __html: `
/* Fullscreen presentation: drop the app rail while presenting. */
nav[aria-label="Primary"] { display: none !important; }

@media print {
  nav[aria-label="Primary"],
  [data-lecture-chrome] { display: none !important; }

  html, body { height: auto !important; overflow: visible !important; background: #fff !important; }
  .h-screen { height: auto !important; }
  .overflow-hidden { overflow: visible !important; }
  main { overflow: visible !important; }

  [data-lecture-stage] {
    overflow: visible !important;
    height: auto !important;
    background: #fff !important;
  }

  /* Keep annotation ink (SVG strokes / text) in full color on paper. */
  [data-annotation-root] svg,
  [data-annotation-root] path,
  [data-annotation-root] foreignObject {
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }
}
`,
      }}
    />
  );
}
