(function () {
  var input = document.getElementById("device-filter");
  var grid = document.getElementById("device-grid");
  if (!input || !grid) return;
  input.addEventListener("input", function () {
    var q = input.value.trim().toLowerCase();
    Array.prototype.forEach.call(grid.querySelectorAll(".device-card"), function (card) {
      var hay = card.getAttribute("data-search") || "";
      card.style.display = hay.indexOf(q) === -1 ? "none" : "";
    });
  });
})();
