source "https://rubygems.org"

# GitHub Pages: use the github-pages gem for compatibility
# gem "jekyll", "~> 4.4.1"
gem "github-pages", group: :jekyll_plugins
gem "minima", "~> 2.5"

group :jekyll_plugins do
  gem "jekyll-feed", "~> 0.12"
end

# Windows and JRuby do not include zoneinfo files
platforms :windows, :jruby do
  gem "tzinfo", ">= 1", "< 3"
  gem "tzinfo-data"
end

# Performance-booster for watching directories on Windows
gem "wdm", "~> 0.1", :platforms => [:windows]

# Lock http_parser.rb on JRuby
gem "http_parser.rb", "~> 0.6.0", :platforms => [:jruby]

# Required for Ruby 3+ local serve
gem "webrick", "~> 1.8"
