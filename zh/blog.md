---
layout: default
title: 文章
lang: zh
permalink: /zh/blog/
---
{% include i18n.html %}
<section class="container">
  <header class="page-head">
    <p class="eyebrow">Journal</p>
    <h1>{{ t.posts_title }}</h1>
    <p class="lede">{{ t.posts_lede }}</p>
  </header>
  <div class="post-list">
    {% assign localized_posts = site.posts | where: "lang", lang %}
    {% for post in localized_posts %}
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
