// ==UserScript==
// @name         USTB-RANK · 每门课课堂排名
// @namespace    https://byyt.ustb.edu.cn/
// @version      2.0.0
// @description  每门课课堂排名（教学班内总评排名）直接显示在「总评成绩」分数下方，无需滚动；表格最右同时附「课堂排名/真实成绩」两列；持续补齐，不怕页面重渲染。
// @author       you
// @match        https://byyt.ustb.edu.cn/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  console.log('[USTB-RANK] v2.0.0 启动 @', location.pathname);

  var API = '/cjgl/grcjcx/grcjcx';
  var recordMap = null;
  var observedDocs = []; // 已挂监听的文档

  function post(url, body) {
    return fetch(url, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json;charset=UTF-8', 'X-Requested-With': 'XMLHttpRequest' },
      body: JSON.stringify(body)
    }).then(function (r) {
      if (!r.ok) throw new Error(url + ' HTTP ' + r.status);
      return r.json();
    });
  }

  function fetchAll() {
    var base = { xn: '', xq: '', kcmc: '', cxbj: '', pylx: '1', current: 1, pageSize: 100, xscjlb: '', sffx: '', yhdm: '' };
    return post(API, base).then(function (first) {
      if (!first.content || !first.content.list) throw new Error('成绩接口返回异常');
      var list = first.content.list.slice();
      var pages = first.content.pages || 1;
      var chain = Promise.resolve();
      for (var p = 2; p <= pages && p <= 20; p++) {
        (function (page) {
          chain = chain.then(function () {
            return post(API, Object.assign({}, base, { current: page })).then(function (nx) {
              list = list.concat(nx.content.list);
            });
          });
        })(p);
      }
      return chain.then(function () { return list; });
    });
  }

  function pctText(pm, zrs) {
    if (!pm || !zrs) return '';
    var p = (pm / zrs) * 100;
    return ' 前' + (p < 10 ? p.toFixed(1) : String(Math.round(p)) + '%');
  }

  function toast(text, ok) {
    if (document.getElementById('ustb-ext-toast')) return;
    var t = document.createElement('div');
    t.id = 'ustb-ext-toast';
    t.style.cssText = 'position:fixed;right:12px;bottom:12px;z-index:99999;border-radius:6px;padding:8px 14px;font:12px/1.6 "Microsoft YaHei",sans-serif;max-width:340px;box-shadow:0 2px 8px rgba(0,0,0,.2);' +
      (ok ? 'background:#f0f9eb;color:#4c9e34;border:1px solid #a9d86e;' : 'background:#fef0f0;color:#c0392b;border:1px solid #f56c6c;');
    t.textContent = text;
    document.body.appendChild(t);
    setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, ok ? 8000 : 15000);
  }

  function findWrapper(doc) {
    var heads = doc.querySelectorAll('.ivu-table-header thead');
    for (var i = 0; i < heads.length; i++) {
      var ths = heads[i].querySelectorAll('th');
      for (var j = 0; j < ths.length; j++) {
        if (ths[j].textContent.indexOf('总评成绩') !== -1) return heads[i].closest('.ivu-table-wrapper');
      }
    }
    return null;
  }

  var check = null; // 启动后赋值

  function watchDoc(doc) {
    if (observedDocs.indexOf(doc) !== -1) return;
    observedDocs.push(doc);
    try {
      var MO = (doc.defaultView && doc.defaultView.MutationObserver) || MutationObserver;
      var t = null;
      new MO(function () {
        if (!check) return;
        clearTimeout(t);
        t = setTimeout(check, 300);
      }).observe(doc.documentElement, { childList: true, subtree: true });
    } catch (e) { }
  }

  function enhanceDoc(doc) {
    var wrapper = findWrapper(doc);
    if (!wrapper) return -1;
    var headerTable = wrapper.querySelector('.ivu-table-header table');
    var bodyTable = wrapper.querySelector('.ivu-table-body table');
    if (!headerTable || !bodyTable) return -1;

    var ths = headerTable.querySelectorAll('thead th');
    var idxXnxq = -1, idxKcdm = -1, idxZpcj = -1;
    for (var i = 0; i < ths.length; i++) {
      var t = ths[i].textContent.trim();
      if (t === '学年学期') idxXnxq = i;
      if (t === '课程代码') idxKcdm = i;
      if (t === '总评成绩') idxZpcj = i;
    }
    if (idxXnxq < 0 || idxKcdm < 0) return -1;

    if (!headerTable.querySelector('col[data-ustb]')) {
      var COL_W = 95, ADD = COL_W * 2;
      [headerTable, bodyTable].forEach(function (tbl) {
        var cg = tbl.querySelector('colgroup');
        if (cg) {
          for (var k = 0; k < 2; k++) {
            var col = doc.createElement('col');
            col.setAttribute('width', COL_W);
            col.setAttribute('data-ustb', '1');
            cg.appendChild(col);
          }
        }
        var m = /^([\d.]+)px$/.exec(tbl.style.width || '');
        if (m) tbl.style.width = (parseFloat(m[1]) + ADD) + 'px';
      });
    }

    if (!headerTable.querySelector('th.ustb-ext-th')) {
      var hr = headerTable.querySelector('thead tr');
      ['课堂排名', '真实成绩'].forEach(function (title) {
        var th = doc.createElement('th');
        th.className = 'ustb-ext-th';
        th.style.textAlign = 'center';
        th.textContent = title;
        hr.appendChild(th);
      });
    }

    var rows = bodyTable.querySelectorAll('tbody tr');
    var usedKeys = {};
    var done = 0;
    for (var r = 0; r < rows.length; r++) {
      var cells = rows[r].querySelectorAll('td');
      if (cells.length <= idxKcdm) continue;
      var key = cells[idxXnxq].textContent.trim() + '|' + cells[idxKcdm].textContent.trim();
      var slot = usedKeys[key] || 0;
      usedKeys[key] = slot + 1;
      var rec = recordMap ? ((recordMap[key] || [])[slot]) : null;

      // 1) 总评成绩单元格内加排名徽标（无需滚动即可见）
      if (idxZpcj >= 0 && cells[idxZpcj] && !cells[idxZpcj].querySelector('.ustb-rank-badge')) {
        var badge = doc.createElement('div');
        badge.className = 'ustb-rank-badge';
        if (rec && rec.zrs) {
          badge.textContent = '排名 ' + rec.pm + '/' + rec.zrs + pctText(rec.pm, rec.zrs);
          badge.title = '课堂排名：该教学班总评成绩排名';
          badge.style.cssText = 'font-size:11px;line-height:1.4;color:#1c77d8;white-space:nowrap;';
          cells[idxZpcj].appendChild(badge);
          done++;
        }
      }

      // 2) 行尾两列（幂等）
      if (!rows[r].querySelector('td.ustb-ext-td')) {
        var tdRank = doc.createElement('td');
        tdRank.className = 'ustb-ext-td';
        tdRank.style.textAlign = 'center';
        tdRank.textContent = (rec && rec.zrs) ? (rec.pm + '/' + rec.zrs + pctText(rec.pm, rec.zrs)) : (recordMap ? '—' : '…');
        tdRank.title = '课堂排名：该教学班总评成绩排名';

        var tdReal = doc.createElement('td');
        tdReal.className = 'ustb-ext-td';
        tdReal.style.textAlign = 'center';
        if (rec) {
          var real = rec.zzzscj, shown = rec.zzcj;
          tdReal.textContent = (real != null && real !== '') ? real : '—';
          if (real && shown && String(real) !== String(shown)) {
            tdReal.title = '界面显示「' + shown + '」，实际分数为 ' + real;
            tdReal.style.color = '#2d8cf0';
            tdReal.style.fontWeight = 'bold';
          }
        } else {
          tdReal.textContent = recordMap ? '—' : '…';
        }
        rows[r].appendChild(tdRank);
        rows[r].appendChild(tdReal);
        done++;
      }
    }
    return done;
  }

  function enhanceAll() {
    if (!recordMap) return -1;
    var docs = [];
    (function walk(d) {
      if (!d) return;
      try {
        if (!d.body || !d.documentElement) return;
        docs.push(d);
        watchDoc(d); // 给每个文档都挂监听（含 iframe 内部变化）
        var frs = d.querySelectorAll('iframe');
        for (var i = 0; i < frs.length; i++) {
          try { walk(frs[i].contentDocument); } catch (e) { }
        }
      } catch (e) { }
    })(document);
    var total = 0, found = false;
    docs.forEach(function (d) {
      try {
        var n = enhanceDoc(d);
        if (n >= 0) { found = true; total += n; }
      } catch (e) { console.warn('[USTB-RANK] 增强失败:', e); }
    });
    return found ? total : -1;
  }

  fetchAll().then(function (list) {
    recordMap = {};
    var total = list.length;
    list.forEach(function (rec) {
      var key = (rec.xnxqmc || '') + '|' + (rec.kcdm || '');
      (recordMap[key] = recordMap[key] || []).push(rec);
    });
    console.log('[USTB-RANK] 成绩加载成功:', total, '门');

    var toasted = false;
    check = function () {
      var n = enhanceAll();
      if (!toasted && n > 0) {
        toasted = true;
        toast('✓ 每门课课堂排名已显示：看「总评成绩」列分数下方的小字（排名 x/y）', true);
      }
    };
    check();

    // 永久低速轮询兜底：列被系统冲掉后 1 秒内补回
    setInterval(check, 1000);
  }, function (e) {
    console.warn('[USTB-RANK] 成绩接口失败：', e);
    toast('USTB-RANK：接口请求失败（' + (e && e.message || e) + '）。若未登录请先登录教务系统。', false);
  });
})();
