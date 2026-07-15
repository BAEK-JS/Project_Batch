import { $, esc } from './utils.js';
import { parseXML } from './parser.js';
import { loadGraphAsJobList, loadXmlAsJobList } from './ui.js';

export const XMLDIR = { files: [], selected: '', checked: new Set() };

export function getXmlRelPath(f) {
  return f.webkitRelativePath || f.name;
}

export function pickXmlFolder() {
  const input = document.createElement('input');
  input.type = 'file';
  input.multiple = true;
  input.webkitdirectory = true;
  input.accept = '.xml,.txt';
  input.style.display = 'none';
  document.body.appendChild(input);
  input.addEventListener('change', () => {
    const files = [...input.files].filter(f => /\.(xml|txt)$/i.test(f.name));
    XMLDIR.files = files;
    XMLDIR.selected = '';
    XMLDIR.checked.clear();
    renderXmlFolderTree(files);
    updateXmlSelectionSummary();
    input.remove();
  }, { once: true });
  input.click();
}

export function clearXmlFolderList() {
  XMLDIR.files = [];
  XMLDIR.selected = '';
  XMLDIR.checked.clear();
  const tree = $('dir-tree');
  if (tree) tree.innerHTML = '<div class="dir-empty">아직 선택된 XML 폴더가 없습니다.</div>';
  updateXmlSelectionSummary();
}

export function updateXmlSelectionSummary() {
  const summary = $('dir-summary');
  const btn = $('btn-load-selected-xml');
  const selectedCount = XMLDIR.checked.size;
  if (summary) {
    summary.textContent = `선택 XML: ${selectedCount}개 / 전체 ${XMLDIR.files.length}개`;
  }
  if (btn) btn.disabled = selectedCount === 0;
}

export function setAllXmlChecked(checked) {
  XMLDIR.checked.clear();
  if (checked) {
    for (const f of XMLDIR.files) XMLDIR.checked.add(getXmlRelPath(f));
  }
  const tree = $('dir-tree');
  if (tree) tree.querySelectorAll('.dir-file-check').forEach(cb => { cb.checked = checked; });
  updateXmlSelectionSummary();
}

export function renderXmlFolderTree(files) {
  const tree = $('dir-tree');
  if (!tree) return;
  if (!files.length) {
    tree.innerHTML = '<div class="dir-empty">선택한 폴더에서 XML 파일을 찾지 못했습니다.</div>';
    updateXmlSelectionSummary();
    return;
  }

  const groups = new Map();
  for (const f of files) {
    const rel = getXmlRelPath(f);
    const parts = rel.split('/');
    const group = parts.length > 1 ? parts.slice(0, -1).join('/') : '(루트)';
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group).push(f);
  }

  let html = '';
  for (const [g, arr] of [...groups].sort((a, b) => a[0].localeCompare(b[0]))) {
    html += `<div class="dir-group"><div class="dir-group-h"><span>📂 ${esc(g)}</span><span style="color:var(--text3);font-weight:400">${arr.length}개</span></div>`;
    html += arr.sort((a, b) => a.name.localeCompare(b.name)).map(f => {
      const rel = getXmlRelPath(f);
      const checked = XMLDIR.checked.has(rel) ? ' checked' : '';
      return `<label class="dir-file${XMLDIR.selected === rel ? ' on' : ''}" data-rel="${esc(rel)}" title="${esc(rel)}">
        <input type="checkbox" class="dir-file-check" data-rel="${esc(rel)}"${checked}>
        <span class="dir-file-name">📄 ${esc(f.name)}</span>
      </label>`;
    }).join('');
    html += '</div>';
  }
  tree.innerHTML = html;

  tree.querySelectorAll('.dir-file-check').forEach(cb => cb.addEventListener('change', e => {
    const rel = e.target.dataset.rel;
    if (e.target.checked) XMLDIR.checked.add(rel);
    else XMLDIR.checked.delete(rel);
    updateXmlSelectionSummary();
  }));

  tree.querySelectorAll('.dir-file').forEach(el => el.addEventListener('dblclick', async () => {
    const rel = el.dataset.rel;
    const file = XMLDIR.files.find(f => getXmlRelPath(f) === rel);
    if (!file) return;
    XMLDIR.selected = rel;
    tree.querySelectorAll('.dir-file').forEach(x => x.classList.toggle('on', x.dataset.rel === rel));
    const txt = await file.text();
    loadXmlAsJobList(txt, rel);
  }));

  updateXmlSelectionSummary();
}

export function mergeGraphs(graphs) {
  const jobsByName = new Map();
  const edgeSeen = new Set();
  const edges = [];
  for (const g of graphs) {
    for (const j of g.jobs) {
      if (!jobsByName.has(j.name)) jobsByName.set(j.name, j);
    }
    for (const e of g.edges) {
      const key = `${e.from}→${e.to}::${e.cond || ''}`;
      if (edgeSeen.has(key)) continue;
      edgeSeen.add(key);
      edges.push(e);
    }
  }
  return { jobs: [...jobsByName.values()], edges };
}

export async function loadSelectedXmlFiles() {
  if (!XMLDIR.checked.size) {
    alert('로드할 XML 파일을 선택해주세요.');
    return;
  }
  const selectedFiles = XMLDIR.files.filter(f => XMLDIR.checked.has(getXmlRelPath(f)));
  const graphs = [];
  const failed = [];
  for (const f of selectedFiles) {
    try {
      graphs.push(parseXML(await f.text()));
    } catch (e) {
      failed.push(`${getXmlRelPath(f)} : ${e.message}`);
    }
  }
  if (!graphs.length) {
    alert('로드 가능한 XML이 없습니다.\n\n' + failed.join('\n'));
    return;
  }
  loadGraphAsJobList(mergeGraphs(graphs), `선택 XML ${graphs.length}개 병합`);
  if (failed.length) {
    alert('일부 XML은 제외되었습니다.\n\n' + failed.slice(0, 10).join('\n') + (failed.length > 10 ? '\n...' : ''));
  }
}
