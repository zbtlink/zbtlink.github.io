---
layout: default
title: 固件
lang: zh
permalink: /zh/firmware/
---
{% include i18n.html %}
<section class="container">
  <header class="page-head">
    <p class="eyebrow">Firmware</p>
    <h1>{{ t.firmware_title }}</h1>
    <p class="lede">{{ t.firmware_lede }}</p>
    <input id="device-filter" class="search" type="search" placeholder="{{ t.search_placeholder }}">
  </header>
  <div class="card-grid" id="device-grid">
    {% for device in site.data.catalog.devices %}
    <a class="device-card" data-search="{{ device.name | downcase }} {{ device.chipset | downcase }} {{ device.summary | downcase }}" href="{{ device_prefix | append: device.id | append: '/' | relative_url }}">
      <div class="card-kicker">
        <span class="status status-{{ device.status }}">{{ device.status }}</span>
        <span>{{ device.releases.size }} {{ t.versions }}</span>
      </div>
      <h3>{{ device.name }}</h3>
      <p>{{ device.summary }}</p>
      <ul class="spec-row">
        {% if device.chipset != "" %}<li>{{ device.chipset }}</li>{% endif %}
        {% if device.ram != "" %}<li>{{ device.ram }}</li>{% endif %}
        {% if device.wifi != "" %}<li>{{ device.wifi }}</li>{% endif %}
      </ul>
    </a>
    {% endfor %}
  </div>
</section>
