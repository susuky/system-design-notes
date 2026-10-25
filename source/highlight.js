/* Grammars for the textbook's pseudocode, calculations and abbreviated HTTP examples. */
(function (Prism) {
  'use strict';

  Prism.languages.pseudocode = Prism.languages.extend('python', {
    comment: {pattern: /(^|[^\\])(?:#|\/\/).*$/m, lookbehind: true, greedy: true},
    keyword: /\b(?:and|as|assert|await|begin|break|case|commit|continue|def|else|except|exists|fail|false|finally|for|from|if|in|insert|is|lock|loop|not|null|or|raise|return|rollback|then|transaction|true|try|while|with|yield)\b/i,
    constant: /\b[A-Z][A-Z_\d]*\b/,
    function: /\b[a-zA-Z_]\w*(?=\s*\()/,
  });

  Prism.languages.formula = {
    function: /\b(?:ceil|floor|max|min|sum|round|log|exp|sqrt)\b/,
    number: /(?:\b\d+(?:,\d{3})*(?:\.\d+)?|\.\d+)(?:[eE][+-]?\d+)?(?:%|×)?/,
    unit: {pattern: /\b(?:CPU-seconds|Gbit\/s|[KMGT]?i?B(?:\/s)?|ms|AZ|SLO)\b/, alias: 'constant'},
    variable: /\b[A-Za-z][\w]*\b|[Α-ω][₀-₉]?/,
    operator: /[=+×÷≈≥≤−*/^%<>-]/,
    punctuation: /[()[\]{}：:；;]/,
  };

  Prism.languages.state = {
    constant: /\b[A-Z][A-Z_\d]*\b/,
    operator: /[→↘↗←⇒]/,
    punctuation: /[：:]/,
  };

  // These teaching examples omit HTTP versions and Content-Type headers.
  Prism.languages.insertBefore('http', 'request-line', {
    'api-request': {
      pattern: /^(?:CONNECT|DELETE|GET|HEAD|OPTIONS|PATCH|POST|PUT|TRACE)\s+\S+/m,
      inside: {
        method: {pattern: /^[A-Z]+/, alias: 'keyword'},
        url: /\S+$/,
      },
    },
    'api-response': {
      pattern: /→(?:[ \t]*\d{3})?/,
      inside: {operator: /→/, number: /\d{3}/},
    },
    'identity-field': {
      pattern: /^[a-z_]+(?:[ \t]+(?:identity|group))?(?=[ \t]*=)/m,
      alias: 'property',
    },
  });
  Prism.languages.http.property = Prism.languages.json.property;
  Prism.languages.http.string = Prism.languages.json.string;
  Prism.languages.http.number = Prism.languages.json.number;
  Prism.languages.http.boolean = Prism.languages.json.boolean;
  Prism.languages.http.null = Prism.languages.json.null;
  Prism.languages.http.operator = /[=+]/;
  Prism.languages.http.punctuation = /[{}[\],:]/;

  if (typeof document !== 'undefined') {
    Prism.highlightAllUnder(document.getElementById('chapters'));
  }
})(Prism);
