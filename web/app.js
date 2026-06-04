const menuButton = document.querySelector(".menu-button");
const nav = document.querySelector("#site-nav");
const searchInput = document.querySelector("#docs-search");
const sections = Array.from(document.querySelectorAll(".doc-section"));
const sidebarLinks = Array.from(document.querySelectorAll(".docs-sidebar a"));
const copyButtons = Array.from(document.querySelectorAll(".copy-button"));
const backToTop = document.querySelector(".back-to-top");

function normalize(value) {
  return value.trim().toLowerCase();
}

function updateSearch() {
  const query = normalize(searchInput?.value || "");

  sections.forEach((section) => {
    const text = normalize(`${section.textContent || ""} ${section.dataset.search || ""}`);
    section.classList.toggle("is-hidden", Boolean(query) && !text.includes(query));
  });
}

function updateActiveSection() {
  let activeId = "";

  sections.forEach((section) => {
    if (section.classList.contains("is-hidden")) {
      return;
    }

    if (section.getBoundingClientRect().top <= 120) {
      activeId = section.id;
    }
  });

  sidebarLinks.forEach((link) => {
    link.classList.toggle("is-active", link.getAttribute("href") === `#${activeId}`);
  });

  backToTop?.classList.toggle("is-visible", window.scrollY > 700);
}

menuButton?.addEventListener("click", () => {
  const isOpen = nav?.classList.toggle("is-open") || false;
  menuButton.setAttribute("aria-expanded", String(isOpen));
});

searchInput?.addEventListener("input", () => {
  updateSearch();
  updateActiveSection();
});

copyButtons.forEach((button) => {
  button.addEventListener("click", async () => {
    const targetId = button.getAttribute("data-copy-target");
    const target = targetId ? document.getElementById(targetId) : null;
    const value = target?.textContent || "";

    if (!value) {
      return;
    }

    try {
      await navigator.clipboard.writeText(value);
      button.classList.add("is-copied");
      button.textContent = "Copied";
      window.setTimeout(() => {
        button.classList.remove("is-copied");
        button.textContent = "Copy";
      }, 1400);
    } catch {
      button.textContent = "Select";
    }
  });
});

backToTop?.addEventListener("click", () => {
  window.scrollTo({ top: 0, behavior: "smooth" });
});

window.addEventListener("scroll", updateActiveSection, { passive: true });
window.addEventListener("resize", updateActiveSection);
updateActiveSection();
