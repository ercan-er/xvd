// ── Copy install command ───────────────────────────────────────
function copyInstall() {
  const cmd = document.getElementById('install-cmd').textContent;
  navigator.clipboard.writeText(cmd).then(() => {
    const btn   = document.getElementById('copy-btn');
    const copy  = document.getElementById('copy-icon');
    const check = document.getElementById('check-icon');
    const label = document.getElementById('copy-label');

    btn.classList.add('copied');
    copy.style.display  = 'none';
    check.style.display = '';
    label.textContent   = 'Copied!';

    setTimeout(() => {
      btn.classList.remove('copied');
      copy.style.display  = '';
      check.style.display = 'none';
      label.textContent   = 'Copy';
    }, 2000);
  });
}

// ── Terminal animation ─────────────────────────────────────────
const LINES = [
  // prompt + command
  { type: 'cmd', text: '$ xvd https://x.com/NASA/status/1902118174591521056' },
  // fetching
  { type: 'info', text: '  Fetching tweet…', delay: 400 },
  // tweet card
  { type: 'gap' },
  { type: 'info', text: '  @NASA  ·  NASA', color: '#e8e8e8' },
  { type: 'info', text: '  Perseverance Rover captures Martian sunset in stunning 4K', color: '#888' },
  { type: 'info', text: '  1920×1080  ·  00:32  ·  best  ·  12.4 MB', color: '#555' },
  { type: 'gap' },
  // progress bar frames
  { type: 'progress', frames: [
    '  Downloading…  [████░░░░░░░░░░░░]  24%  3.2 MB/s',
    '  Downloading…  [████████░░░░░░░░]  52%  4.1 MB/s',
    '  Downloading…  [████████████░░░░]  74%  4.3 MB/s',
    '  Downloading…  [████████████████] 100%  4.3 MB/s',
  ]},
  { type: 'gap' },
  // done
  { type: 'success', text: '  ✓  Download complete' },
  { type: 'info',    text: '     ~/Movies/xvd_1902118174591521056_best.mp4', color: '#555' },
  { type: 'gap' },
  // next command: subtitle
  { type: 'cmd', text: '$ xvd https://x.com/user/status/123 --subtitle tr', delay: 800 },
  { type: 'info', text: '  Fetching tweet…', delay: 300 },
  { type: 'info', text: '  Translating & burning subtitles…', color: '#fbbf24', delay: 400 },
  { type: 'success', text: '  ✓  Download complete', delay: 600 },
  { type: 'gap' },
  // cursor
  { type: 'cursor' },
];

const body = document.getElementById('terminal-body');
let lineIndex = 0;
let progressInterval = null;

function appendLine(html, extraClass) {
  const el = document.createElement('span');
  el.className = 't-line' + (extraClass ? ' ' + extraClass : '');
  el.innerHTML = html;
  body.appendChild(el);
  return el;
}

function colorize(text) {
  // highlight URLs
  return text.replace(/(https:\/\/\S+)/g, '<span class="t-url">$1</span>');
}

function runNext() {
  if (lineIndex >= LINES.length) return;
  const item = LINES[lineIndex++];
  const delay = item.delay ?? 120;

  setTimeout(() => {
    if (item.type === 'gap') {
      appendLine('&nbsp;');

    } else if (item.type === 'cmd') {
      const html = '<span class="t-prompt">❯</span> <span class="t-cmd">' +
        colorize(item.text.replace(/^\$ /, '')) + '</span>';
      appendLine(html);

    } else if (item.type === 'info') {
      const color = item.color ?? '#555';
      appendLine(`<span style="color:${color}">${item.text}</span>`);

    } else if (item.type === 'success') {
      appendLine(`<span class="t-success">${item.text}</span>`);

    } else if (item.type === 'progress') {
      const el = appendLine('');
      let f = 0;
      const iv = setInterval(() => {
        const bar = item.frames[f];
        const colored = bar
          .replace(/█/g, '<span class="t-bar">█</span>')
          .replace(/░/g, '<span class="t-dim">░</span>');
        el.innerHTML = `<span class="t-progress">${colored}</span>`;
        f++;
        if (f >= item.frames.length) {
          clearInterval(iv);
          runNext();
          return;
        }
      }, 180);
      return; // don't call runNext again below

    } else if (item.type === 'cursor') {
      appendLine('<span class="t-prompt">❯</span> <span class="cursor"></span>');
      return; // end
    }

    runNext();
  }, delay);
}

// Start after a short pause, then loop
function startTerminal() {
  body.innerHTML = '';
  lineIndex = 0;
  runNext();
}

// Restart animation every ~14 seconds so it loops on the page
function loopTerminal() {
  startTerminal();
  setTimeout(loopTerminal, 14000);
}

// Kick off when page loads
window.addEventListener('DOMContentLoaded', () => {
  setTimeout(loopTerminal, 600);
});
