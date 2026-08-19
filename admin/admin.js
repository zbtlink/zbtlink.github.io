(function () {
  var STORAGE = "zbt-firmware-admin";
  var CATALOG_PATH = "_data/catalog.json";
  var titles = {
    dash: "概览",
    devices: "机型管理",
    release: "发布固件",
    posts: "文章",
    settings: "设置"
  };

  var state = {
    catalog: { devices: [] },
    posts: [],
    editingDevice: null,
    editingPost: null
  };

  function $(id) { return document.getElementById(id); }
  function settings() {
    try { return JSON.parse(localStorage.getItem(STORAGE) || "{}"); } catch (e) { return {}; }
  }
  function saveSettings(s) { localStorage.setItem(STORAGE, JSON.stringify(s)); }
  function setStatus(text, cls) {
    $("status").innerHTML = '<span class="' + (cls || "") + '">' + escapeHtml(text) + "</span>";
  }
  function escapeHtml(str) {
    return String(str || "").replace(/[&<>"']/g, function (ch) {
      return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch];
    });
  }
  function utf8ToBase64(str) {
    var bytes = new TextEncoder().encode(str);
    var bin = "";
    bytes.forEach(function (b) { bin += String.fromCharCode(b); });
    return btoa(bin);
  }
  function base64ToUtf8(b64) {
    var bin = atob(b64.replace(/\n/g, ""));
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }
  function prettySize(n) {
    if (n < 1024) return n + " B";
    if (n < 1048576) return (n / 1024).toFixed(1) + " KB";
    return (n / 1048576).toFixed(2) + " MB";
  }
  function slugify(s) {
    return String(s || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  }
  function today() {
    return new Date().toISOString().slice(0, 10);
  }

  function repoOwner() {
    return settings().owner || "zbtlink";
  }
  function repoName() {
    return settings().repo || "zbtlink.github.io";
  }
  function repoBranch() {
    return settings().branch || "main";
  }
  function repoPath() {
    return "/repos/" + repoOwner() + "/" + repoName();
  }

  async function gh(path, opts) {
    var s = settings();
    opts = opts || {};
    var method = opts.method || "GET";
    if (method !== "GET" && !s.githubToken) {
      throw new Error("写入 GitHub 前请先在设置中填写 Token");
    }
    var headers = { Accept: "application/vnd.github+json" };
    if (s.githubToken) headers.Authorization = "Bearer " + s.githubToken;
    if (opts.body) headers["Content-Type"] = "application/json";
    var res = await fetch("https://api.github.com" + path, {
      method: method,
      headers: headers,
      body: opts.body ? JSON.stringify(opts.body) : undefined
    });
    if (!res.ok) {
      var t = await res.text();
      throw new Error("GitHub API " + res.status + ": " + t.slice(0, 300));
    }
    if (res.status === 204) return null;
    return res.json();
  }

  async function commitFiles(files, message) {
    var s = settings();
    var branch = repoBranch();
    var repo = repoPath();
    var ref = await gh(repo + "/git/ref/heads/" + branch);
    var baseSha = ref.object.sha;
    var commit = await gh(repo + "/git/commits/" + baseSha);
    var treeItems = [];
    for (var i = 0; i < files.length; i++) {
      var file = files[i];
      if (file.delete) {
        treeItems.push({ path: file.path, mode: "100644", type: "blob", sha: null });
        continue;
      }
      var blob = await gh(repo + "/git/blobs", {
        method: "POST",
        body: { content: utf8ToBase64(file.content), encoding: "base64" }
      });
      treeItems.push({ path: file.path, mode: "100644", type: "blob", sha: blob.sha });
    }
    var tree = await gh(repo + "/git/trees", {
      method: "POST",
      body: { base_tree: commit.tree.sha, tree: treeItems }
    });
    var next = await gh(repo + "/git/commits", {
      method: "POST",
      body: { message: message, tree: tree.sha, parents: [baseSha] }
    });
    await gh(repo + "/git/refs/heads/" + branch, { method: "PATCH", body: { sha: next.sha } });
    return next.sha;
  }

  function devicePage(device, lang) {
    var permalink = lang === "zh"
      ? "/zh/devices/" + device.id + "/"
      : "/devices/" + device.id + "/";
    return [
      "---",
      "layout: device",
      "lang: " + lang,
      "device_id: " + device.id,
      "title: " + device.name,
      "permalink: " + permalink,
      "---",
      ""
    ].join("\n");
  }

  async function loadCatalog() {
    try {
      var file = await gh(repoPath() + "/contents/" + CATALOG_PATH + "?ref=" + repoBranch());
      state.catalog = JSON.parse(base64ToUtf8(file.content));
    } catch (err) {
      var raw = "https://raw.githubusercontent.com/" + repoOwner() + "/" + repoName() + "/" + repoBranch() + "/" + CATALOG_PATH;
      var res = await fetch(raw);
      if (!res.ok) throw err;
      state.catalog = await res.json();
    }
    if (!state.catalog.devices) state.catalog.devices = [];
    return state.catalog;
  }

  async function loadPosts() {
    try {
      state.posts = await gh(repoPath() + "/contents/_posts?ref=" + repoBranch());
      if (!Array.isArray(state.posts)) state.posts = [];
    } catch (e) {
      state.posts = [];
    }
    return state.posts;
  }

  async function sha256(file) {
    var buf = await file.arrayBuffer();
    var hash = await crypto.subtle.digest("SHA-256", buf);
    return Array.from(new Uint8Array(hash)).map(function (b) {
      return b.toString(16).padStart(2, "0");
    }).join("");
  }

  function ossSafeSegment(s, fallback) {
    var t = String(s || "").trim().replace(/\\/g, "/").split("/").pop();
    t = t.replace(/[^\w.+-]+/g, "-").replace(/^[-.]+|[-.]+$/g, "");
    return t || fallback || "file";
  }

  function ossFileName(name) {
    var base = String(name || "firmware.bin").replace(/\\/g, "/").split("/").pop();
    var dot = base.lastIndexOf(".");
    var stem = dot >= 0 ? base.slice(0, dot) : base;
    var ext = dot >= 0 ? base.slice(dot) : "";
    ext = ext.replace(/[^\w.]+/g, "");
    return ossSafeSegment(stem, "firmware") + (ext || ".bin");
  }

  function versionKey(version) {
    var s = String(version || "").trim();
    if (!/^[\w.+-]+$/.test(s)) {
      throw new Error("版本号只能用英文、数字、点、下划线和短横线，例如 26.08.06。中文说明请写在「发布说明」里。");
    }
    return s;
  }

  function ossUrl(key) {
    var s = settings();
    var encoded = key.split("/").map(encodeURIComponent).join("/");
    if (s.cdnBase) return s.cdnBase.replace(/\/$/, "") + "/" + encoded;
    var region = s.ossRegion || "oss-cn-hangzhou";
    return "https://" + s.ossBucket + "." + region + ".aliyuncs.com/" + encoded;
  }

  function corsHint(err) {
    var msg = (err && err.message) ? err.message : String(err || "");
    if (/XHR error|connected: false|Failed to fetch|NetworkError|ERR_FAILED/i.test(msg)) {
      return "OSS 跨域被浏览器拦截（当前页面来源：" + location.origin +
        "）。请到 Bucket「权限管理 → 跨域设置」添加该来源，方法勾选 GET/POST/PUT/HEAD，允许 Headers 填 *，暴露 Headers 填 ETag。不要用来源 *。";
    }
    return msg;
  }

  async function uploadToOss(key, file, onProgress) {
    var s = settings();
    if (typeof OSS === "undefined") throw new Error("未能加载阿里云 OSS SDK");
    if (!s.ossRegion || !s.ossBucket || !s.ossKey || !s.ossSecret) {
      throw new Error("请先填写 OSS 参数");
    }
    var region = s.ossRegion.replace(/^https?:\/\//, "").replace(/\.aliyuncs\.com$/, "");
    var client = new OSS({
      region: region,
      accessKeyId: s.ossKey,
      accessKeySecret: s.ossSecret,
      bucket: s.ossBucket,
      secure: true,
      timeout: 120000
    });
    try {
      if (onProgress) onProgress(0.05);
      if (file.size >= 80 * 1024 * 1024) {
        await client.multipartUpload(key, file, {
          progress: function (p) { if (onProgress) onProgress(p); }
        });
      } else {
        await client.put(key, file);
        if (onProgress) onProgress(1);
      }
    } catch (err) {
      throw new Error(corsHint(err));
    }
    return ossUrl(key);
  }

  function show(view) {
    document.querySelectorAll(".view").forEach(function (el) { el.classList.add("hidden"); });
    document.querySelectorAll("aside button").forEach(function (btn) {
      btn.classList.toggle("is-active", btn.getAttribute("data-view") === view);
    });
    $("view-" + view).classList.remove("hidden");
    $("view-title").textContent = titles[view];
    if (view === "dash") renderDash();
    if (view === "devices") renderDevices();
    if (view === "release") renderRelease();
    if (view === "posts") renderPosts();
    if (view === "settings") renderSettings();
  }

  function renderDash() {
    var devices = state.catalog.devices || [];
    var releases = 0;
    devices.forEach(function (d) { releases += (d.releases || []).length; });
    $("view-dash").innerHTML =
      '<div class="grid">' +
        '<div class="stat"><div class="muted">机型</div><strong>' + devices.length + "</strong></div>" +
        '<div class="stat"><div class="muted">固件版本</div><strong>' + releases + "</strong></div>" +
        '<div class="stat"><div class="muted">文章</div><strong>' + (state.posts.length || 0) + "</strong></div>" +
      "</div>" +
      (settings().githubToken && settings().ossKey ? "" :
        '<div class="hint" style="margin-top:16px">当前是 <code>' + escapeHtml(location.origin) +
        "</code>。GitHub Token / OSS 密钥按网站分开保存，从公网后台换到本地后需要在「设置」里重新填写一次，数据没有从服务器删除。</div>") +
      '<div class="card" style="margin-top:16px">' +
        "<p>发布流程：设置 GitHub Token 与 OSS → 创建机型 → 上传固件并填写说明 → 保存后自动提交到 GitHub，Pages 稍后更新。</p>" +
        '<div class="row"><a class="btn" href="../firmware/">打开前台固件页</a></div>' +
      "</div>";
  }

  function renderDevices() {
    var html = '<div class="row"><button class="btn btn-primary" id="new-device">新建机型</button></div><div class="list" style="margin-top:12px">';
    (state.catalog.devices || []).forEach(function (d) {
      html += '<div class="item"><div><strong>' + escapeHtml(d.name) + "</strong> <span class='muted'>" +
        escapeHtml(d.id) + " · " + ((d.releases || []).length) + " 个版本</span></div>" +
        '<div class="row"><button class="btn" data-edit="' + escapeHtml(d.id) + '">编辑</button>' +
        '<button class="btn" data-del="' + escapeHtml(d.id) + '">删除</button></div></div>';
    });
    html += "</div><div id='device-form'></div>";
    $("view-devices").innerHTML = html;
    $("new-device").onclick = function () { state.editingDevice = emptyDevice(); drawDeviceForm(); };
    $("view-devices").querySelectorAll("[data-edit]").forEach(function (btn) {
      btn.onclick = function () {
        state.editingDevice = JSON.parse(JSON.stringify(state.catalog.devices.find(function (d) { return d.id === btn.getAttribute("data-edit"); })));
        drawDeviceForm();
      };
    });
    $("view-devices").querySelectorAll("[data-del]").forEach(function (btn) {
      btn.onclick = function () { deleteDevice(btn.getAttribute("data-del")); };
    });
  }

  function emptyDevice() {
    return { id: "", name: "", chipset: "", cpu: "", ram: "", flash: "", wifi: "", ports: "", status: "supported", summary: "", flash_notes: "", releases: [] };
  }

  function drawDeviceForm() {
    var d = state.editingDevice;
    $("device-form").innerHTML =
      '<div class="card" style="margin-top:16px"><h3>' + (d.id ? "编辑机型" : "新建机型") + "</h3>" +
      field("id", "型号 ID（英文/数字，作为 URL）", d.id, !d._existing) +
      field("name", "显示名称", d.name) +
      field("chipset", "芯片", d.chipset) +
      field("cpu", "CPU", d.cpu) +
      field("ram", "内存", d.ram) +
      field("flash", "闪存", d.flash) +
      field("wifi", "无线", d.wifi) +
      field("ports", "网口", d.ports) +
      '<label>状态<select id="f-status"><option value="supported">supported</option><option value="preview">preview</option></select></label>' +
      '<label>简介<textarea id="f-summary">' + escapeHtml(d.summary) + "</textarea></label>" +
      '<label>刷机说明<textarea id="f-notes">' + escapeHtml(d.flash_notes) + "</textarea></label>" +
      '<div class="row"><button class="btn btn-primary" id="save-device">保存并发布到 GitHub</button></div></div>';
    $("f-status").value = d.status || "supported";
    if (d.id) {
      d._existing = true;
      $("f-id").readOnly = true;
    }
    $("save-device").onclick = saveDevice;
  }

  function field(id, label, value, enabled) {
    var dis = enabled === false ? " readonly" : "";
    return '<label>' + label + '<input id="f-' + id + '" value="' + escapeHtml(value || "") + '"' + dis + "></label>";
  }

  function readDeviceForm() {
    var id = slugify($("f-id").value || $("f-name").value);
    return {
      id: id,
      name: $("f-name").value.trim(),
      chipset: $("f-chipset").value.trim(),
      cpu: $("f-cpu").value.trim(),
      ram: $("f-ram").value.trim(),
      flash: $("f-flash").value.trim(),
      wifi: $("f-wifi").value.trim(),
      ports: $("f-ports").value.trim(),
      status: $("f-status").value,
      summary: $("f-summary").value.trim(),
      flash_notes: $("f-notes").value.trim(),
      releases: (state.editingDevice && state.editingDevice.releases) || []
    };
  }

  async function saveDevice() {
    try {
      var device = readDeviceForm();
      if (!device.id || !device.name) throw new Error("请填写型号 ID 和名称");
      var list = state.catalog.devices;
      var idx = list.findIndex(function (d) { return d.id === device.id; });
      if (idx >= 0) list[idx] = device; else list.push(device);
      setStatus("正在提交机型…");
      await commitFiles([
        { path: CATALOG_PATH, content: JSON.stringify({ devices: list }, null, 2) + "\n" },
        { path: "_devices/" + device.id + ".md", content: devicePage(device, "en") },
        { path: "zh/devices/" + device.id + ".md", content: devicePage(device, "zh") }
      ], "更新机型 " + device.name);
      setStatus("机型已发布，等待 GitHub Pages 构建。", "ok");
      await refresh();
      show("devices");
    } catch (e) { setStatus(e.message, "err"); }
  }

  async function deleteDevice(id) {
    if (!confirm("删除机型 " + id + "？不会删除 OSS 上已上传的文件。")) return;
    try {
      state.catalog.devices = state.catalog.devices.filter(function (d) { return d.id !== id; });
      await commitFiles([
        { path: CATALOG_PATH, content: JSON.stringify(state.catalog, null, 2) + "\n" },
        { path: "_devices/" + id + ".md", delete: true },
        { path: "zh/devices/" + id + ".md", delete: true }
      ], "删除机型 " + id);
      setStatus("已删除机型", "ok");
      await refresh();
      show("devices");
    } catch (e) { setStatus(e.message, "err"); }
  }

  function renderRelease() {
    var opts = (state.catalog.devices || []).map(function (d) {
      return '<option value="' + escapeHtml(d.id) + '">' + escapeHtml(d.name) + "</option>";
    }).join("");
    $("view-release").innerHTML =
      '<div class="card">' +
      '<label>机型<select id="r-device">' + opts + "</select></label>" +
      '<label>版本号<input id="r-version" placeholder="26.08.06"></label>' +
      '<label>通道<select id="r-channel"><option value="stable">stable</option><option value="beta">beta</option><option value="snapshot">snapshot</option></select></label>' +
      '<label>日期<input id="r-date" type="date" value="' + today() + '"></label>' +
      '<label>发布说明<textarea id="r-notes" placeholder="修复内容、注意事项"></textarea></label>' +
      '<label>固件文件（可多选）<input id="r-files" type="file" multiple></label>' +
      '<div class="muted">OSS 路径：firmware/机型/版本/文件名。版本号请用 26.08.06 这种英文数字，中文写在发布说明。</div>' +
      '<div class="progress"><span id="r-bar"></span></div>' +
      '<div class="row"><button class="btn btn-primary" id="r-publish">上传并发布</button></div></div>' +
      '<div id="r-history"></div>';
    $("r-device").onchange = drawHistory;
    $("r-publish").onclick = publishRelease;
    drawHistory();
  }

  function drawHistory() {
    var id = $("r-device") && $("r-device").value;
    var device = (state.catalog.devices || []).find(function (d) { return d.id === id; });
    if (!device) { $("r-history").innerHTML = ""; return; }
    var html = '<div class="card" style="margin-top:16px"><h3>历史版本</h3><div class="list">';
    (device.releases || []).slice().reverse().forEach(function (rel) {
      html += '<div class="item"><div><strong>' + escapeHtml(rel.version) + "</strong> · " +
        escapeHtml(rel.date || "") + ' <span class="muted">' + escapeHtml(rel.channel || "") +
        "</span><div class='muted'>" + escapeHtml((rel.notes || "").slice(0, 80)) + "</div></div></div>";
    });
    html += "</div></div>";
    $("r-history").innerHTML = html;
  }

  async function publishRelease() {
    try {
      var id = $("r-device").value;
      var version = versionKey($("r-version").value.trim());
      var device = state.catalog.devices.find(function (d) { return d.id === id; });
      if (!device) throw new Error("请选择机型");
      var files = $("r-files").files;
      if (!files.length) throw new Error("请选择至少一个固件文件");
      var uploaded = [];
      for (var i = 0; i < files.length; i++) {
        var file = files[i];
        setStatus("计算校验并上传 " + file.name + " (" + (i + 1) + "/" + files.length + ")…");
        var sum = await sha256(file);
        var key = "firmware/" + ossSafeSegment(id, "device") + "/" + version + "/" + ossFileName(file.name);
        var url = await uploadToOss(key, file, function (p) {
          $("r-bar").style.width = Math.round(p * 100) + "%";
        });
        uploaded.push({
          type: guessType(file.name),
          name: file.name,
          url: url,
          sha256: sum,
          size: prettySize(file.size)
        });
      }
      var release = {
        version: version,
        date: $("r-date").value || today(),
        channel: $("r-channel").value,
        notes: $("r-notes").value.trim(),
        files: uploaded
      };
      device.releases = device.releases || [];
      var exist = device.releases.findIndex(function (r) { return r.version === version; });
      if (exist >= 0) device.releases[exist] = release;
      else device.releases.push(release);
      setStatus("正在提交 GitHub Pages…");
      await commitFiles([
        { path: CATALOG_PATH, content: JSON.stringify(state.catalog, null, 2) + "\n" }
      ], "发布固件 " + device.name + " " + version);
      setStatus("已发布 " + device.name + " " + version + "，Pages 构建完成后可在前台看到。", "ok");
      $("r-files").value = "";
      await refresh();
      show("release");
    } catch (e) { setStatus(e.message, "err"); }
  }

  function guessType(name) {
    var n = name.toLowerCase();
    if (n.indexOf("factory") >= 0) return "factory";
    if (n.indexOf("sysupgrade") >= 0) return "sysupgrade";
    if (n.indexOf("kernel") >= 0 || n.indexOf("initramfs") >= 0) return "kernel";
    return "firmware";
  }

  function renderPosts() {
    var html = '<div class="row"><button class="btn btn-primary" id="new-post">写文章</button></div><div class="list" style="margin-top:12px">';
    (state.posts || []).forEach(function (p) {
      html += '<div class="item"><div>' + escapeHtml(p.name) + '</div><div class="row">' +
        '<button class="btn" data-edit-post="' + encodeURIComponent(p.path) + '">编辑</button>' +
        '<button class="btn" data-del-post="' + encodeURIComponent(p.path) + '">删除</button></div></div>';
    });
    html += '</div><div id="post-form"></div>';
    $("view-posts").innerHTML = html;
    $("new-post").onclick = function () {
      state.editingPost = { title: "", date: today(), body: "", path: "", lang: "en" };
      drawPostForm();
    };
    $("view-posts").querySelectorAll("[data-edit-post]").forEach(function (btn) {
      btn.onclick = function () { editPost(decodeURIComponent(btn.getAttribute("data-edit-post"))); };
    });
    $("view-posts").querySelectorAll("[data-del-post]").forEach(function (btn) {
      btn.onclick = function () { deletePost(decodeURIComponent(btn.getAttribute("data-del-post"))); };
    });
  }

  function parsePost(raw) {
    var m = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
    if (!m) return { title: "", date: today(), body: raw };
    var fm = m[1];
    var title = (fm.match(/^title:\s*(.*)$/m) || [])[1] || "";
    title = title.replace(/^["']|["']$/g, "");
    var date = (fm.match(/^date:\s*(\d{4}-\d{2}-\d{2})/m) || [])[1] || today();
    var lang = (fm.match(/^lang:\s*(\w+)/m) || [])[1] || "en";
    return { title: title, date: date, body: m[2].trim(), lang: lang };
  }

  function serializePost(post) {
    var lines = [
      "---",
      "layout: post",
      'title: "' + String(post.title).replace(/"/g, '\\"') + '"',
      "date: " + post.date + " 10:00:00 +0800",
      "lang: " + (post.lang || "en"),
      "categories: news"
    ];
    if (post.lang === "zh") {
      lines.push("permalink: /zh/blog/" + slugify(post.title) + "/");
    }
    return lines.concat(["---", "", post.body.trim(), ""]).join("\n");
  }

  async function editPost(path) {
    var s = settings();
    var file = await gh("/repos/" + s.owner + "/" + s.repo + "/contents/" + path);
    var parsed = parsePost(base64ToUtf8(file.content));
    parsed.path = path;
    state.editingPost = parsed;
    drawPostForm();
  }

  function drawPostForm() {
    var p = state.editingPost;
    $("post-form").innerHTML =
      '<div class="card" style="margin-top:16px">' +
      field("title", "标题", p.title) +
      '<label>语言<select id="f-lang"><option value="en">English</option><option value="zh">中文</option></select></label>' +
      '<label>日期<input id="f-date" type="date" value="' + escapeHtml(p.date) + '"></label>' +
      '<label>正文（Markdown）<textarea id="f-body">' + escapeHtml(p.body) + "</textarea></label>" +
      '<div class="row"><button class="btn btn-primary" id="save-post">保存并发布</button></div></div>';
    $("f-lang").value = p.lang || "en";
    $("save-post").onclick = savePost;
  }

  async function savePost() {
    try {
      var title = $("f-title").value.trim();
      var date = $("f-date").value;
      var body = $("f-body").value;
      var postLang = $("f-lang").value || "en";
      if (!title) throw new Error("请填写标题");
      var slug = slugify(title) || "update";
      var path = state.editingPost.path || ("_posts/" + date + "-" + slug + ".md");
      if (!state.editingPost.path) path = "_posts/" + date + "-" + slug + ".md";
      var post = { title: title, date: date, body: body, lang: postLang };
      setStatus("正在发布文章…");
      var files = [{ path: path, content: serializePost(post) }];
      if (state.editingPost.path && state.editingPost.path !== path) {
        files.push({ path: state.editingPost.path, delete: true });
      }
      await commitFiles(files, "发布文章 " + title);
      setStatus("文章已发布", "ok");
      await refresh();
      show("posts");
    } catch (e) { setStatus(e.message, "err"); }
  }

  async function deletePost(path) {
    if (!confirm("删除文章 " + path + "？")) return;
    try {
      await commitFiles([{ path: path, delete: true }], "删除文章 " + path);
      setStatus("文章已删除", "ok");
      await refresh();
      show("posts");
    } catch (e) { setStatus(e.message, "err"); }
  }

  function renderSettings() {
    var s = settings();
    $("view-settings").innerHTML =
      '<div class="card">' +
      fieldVal("owner", "GitHub 用户/组织", s.owner || "zbtlink") +
      fieldVal("repo", "仓库名", s.repo || "zbtlink.github.io") +
      fieldVal("branch", "分支", s.branch || "main") +
      fieldVal("githubToken", "GitHub Token（repo 权限）", s.githubToken || "", true) +
      fieldVal("ossRegion", "OSS Region（如 oss-cn-hangzhou）", s.ossRegion || "oss-cn-hangzhou") +
      fieldVal("ossBucket", "OSS Bucket", s.ossBucket || "") +
      fieldVal("ossKey", "OSS AccessKey ID", s.ossKey || "", true) +
      fieldVal("ossSecret", "OSS AccessKey Secret", s.ossSecret || "", true) +
      fieldVal("cdnBase", "CDN 或自定义域名（可选，如 https://fw.zbtlink.com）", s.cdnBase || "") +
      '<div class="row"><button class="btn btn-primary" id="save-settings">保存到本机</button>' +
      '<button class="btn" id="reload-data">重新拉取仓库数据</button></div></div>' +
      '<div class="card" style="margin-top:16px">' +
      "<h3>从公网后台导入</h3>" +
      "<p class='muted'>在 https://open.zbtlink.com/tools/export-settings.html 复制设置，粘贴到下方。</p>" +
      '<label>设置 JSON<textarea id="f-import" placeholder="{ &quot;githubToken&quot;: &quot;...&quot;, &quot;ossKey&quot;: &quot;...&quot; }"></textarea></label>' +
      '<div class="row"><button class="btn btn-primary" id="import-settings">导入并保存到本机</button></div></div>' +
      '<div class="hint" style="margin-top:16px">' +
      "<p><strong>GitHub Token：</strong> GitHub → Settings → Developer settings → Personal access tokens，勾选 repo。</p>" +
      "<p><strong>OSS CORS：</strong> 本地后台请把来源设为 <code>http://127.0.0.1:4000</code> 和 <code>http://localhost:4000</code>（不要用 *），方法勾选 GET/PUT/POST/HEAD，允许 Headers 填 <code>*</code>，暴露 Headers 填 <code>ETag</code>。</p>" +
      "<p>建议使用仅有 firmware/ 前缀写权限的 RAM 子账号。不要把密钥提交进仓库。</p>" +
      "</div>";
    $("save-settings").onclick = function () {
      saveSettings({
        owner: $("f-owner").value.trim(),
        repo: $("f-repo").value.trim(),
        branch: $("f-branch").value.trim() || "main",
        githubToken: $("f-githubToken").value.trim(),
        ossRegion: $("f-ossRegion").value.trim(),
        ossBucket: $("f-ossBucket").value.trim(),
        ossKey: $("f-ossKey").value.trim(),
        ossSecret: $("f-ossSecret").value.trim(),
        cdnBase: $("f-cdnBase").value.trim()
      });
      setStatus("设置已保存在本机浏览器", "ok");
    };
    $("import-settings").onclick = function () {
      try {
        var parsed = JSON.parse($("f-import").value.trim());
        if (!parsed || typeof parsed !== "object") throw new Error("JSON 无效");
        saveSettings({
          owner: parsed.owner || "zbtlink",
          repo: parsed.repo || "zbtlink.github.io",
          branch: parsed.branch || "main",
          githubToken: parsed.githubToken || "",
          ossRegion: parsed.ossRegion || "oss-cn-hangzhou",
          ossBucket: parsed.ossBucket || "",
          ossKey: parsed.ossKey || "",
          ossSecret: parsed.ossSecret || "",
          cdnBase: parsed.cdnBase || ""
        });
        setStatus("已导入到 " + location.origin + "，正在刷新…", "ok");
        refresh().then(function () { show("settings"); });
      } catch (e) {
        setStatus("导入失败：" + e.message, "err");
      }
    };
    $("reload-data").onclick = function () { refresh().then(function () { setStatus("已同步仓库数据", "ok"); show("dash"); }); };
  }

  function fieldVal(id, label, value, secret) {
    var type = secret ? ' type="password"' : "";
    return "<label>" + label + '<input id="f-' + id + '"' + type + ' value="' + escapeHtml(value) + '"></label>';
  }

  async function refresh() {
    try {
      await loadCatalog();
      await loadPosts();
    } catch (e) {
      setStatus(e.message, "err");
    }
  }

  document.querySelectorAll("aside button").forEach(function (btn) {
    btn.onclick = function () { show(btn.getAttribute("data-view")); };
  });

  refresh().then(function () { show("dash"); });
})();
