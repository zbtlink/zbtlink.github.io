---
layout: default
title: 固件下载
permalink: /firmware/
---
<section class="container">
  <header class="page-head">
    <p class="eyebrow">Firmware</p>
    <h1>路由器机型</h1>
    <p class="lede">选择机型查看固件、发布说明与历史版本。文件托管在 OSS，下载前请核对 SHA256。</p>
    <input id="device-filter" class="search" type="search" placeholder="搜索型号、芯片…">
  </header>
  <div class="card-grid" id="device-grid">
    {% for device in site.data.catalog.devices %}
    <a class="device-card" data-search="{{ device.name | downcase }} {{ device.chipset | downcase }} {{ device.summary | downcase }}" href="{{ '/devices/' | append: device.id | append: '/' | relative_url }}">
      <div class="card-kicker">
        <span class="status status-{{ device.status }}">{{ device.status }}</span>
        <span>{{ device.releases.size }} 个版本</span>
      </div>
      <h3>{{ device.name }}</h3>
      <p>{{ device.summary }}</p>
      <ul class="spec-row">
        <li>{{ device.chipset }}</li>
        <li>{{ device.ram }}</li>
        <li>{{ device.wifi }}</li>
      </ul>
    </a>
    {% endfor %}
  </div>
</section>
