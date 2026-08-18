---
layout: default
title: 文章
permalink: /blog/
---
<section class="container">
  <header class="page-head">
    <p class="eyebrow">Journal</p>
    <h1>文章</h1>
    <p class="lede">版本说明、刷机教程与平台公告。</p>
  </header>
  <div class="post-list">
    {% for post in site.posts %}
    <article class="post-row">
      <time>{{ post.date | date: '%Y-%m-%d' }}</time>
      <div>
        <h3><a href="{{ post.url | relative_url }}">{{ post.title }}</a></h3>
        <p>{{ post.excerpt | strip_html | truncate: 140 }}</p>
      </div>
    </article>
    {% endfor %}
  </div>
</section>
