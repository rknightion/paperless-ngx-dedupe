// MathJax configuration for Paperless-NGX Dedupe documentation
window.MathJax = {
  tex: {
    inlineMath: [["\\(", "\\)"]],
    displayMath: [["\\[", "\\]"]],
    processEscapes: true,
    processEnvironments: true,
    packages: {'[+]': ['ams', 'newcommand', 'noundefined']}
  },
  chtml: {
    scale: 1,
    minScale: .5,
    matchFontHeight: false
  },
  options: {
    ignoreHtmlClass: ".*|",
    processHtmlClass: "arithmatex"
  }
};
