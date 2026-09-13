export function cleanText(value, max = 160) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

export function escapeCss(value) {
  if (window.CSS && typeof window.CSS.escape === 'function') return window.CSS.escape(value);
  return String(value).replace(/([^a-zA-Z0-9_-])/g, '\\$1');
}

export function getXPath(element) {
  if (!(element instanceof Element)) return '';
  const parts = [];
  let current = element;
  while (current && current.nodeType === Node.ELEMENT_NODE) {
    let index = 1;
    let sibling = current.previousElementSibling;
    while (sibling) {
      if (sibling.tagName === current.tagName) index++;
      sibling = sibling.previousElementSibling;
    }
    parts.unshift(`${current.tagName.toLowerCase()}[${index}]`);
    current = current.parentElement;
  }
  return '/' + parts.join('/');
}

export function getNearestSection(element) {
  const section = element?.closest?.('section, header, footer, nav, main, [data-section], [data-component]');
  if (!section) return { section_id: '', section_name: '', component_name: '' };
  const heading = section.querySelector?.('h1,h2,h3,[data-section-title]');
  return {
    section_id: section.id || section.getAttribute('data-section') || '',
    section_name: cleanText(section.getAttribute('aria-label') || section.getAttribute('data-section-title') || heading?.innerText || section.id || section.tagName),
    component_name: section.getAttribute('data-component') || section.className || section.tagName.toLowerCase()
  };
}

export function getElementInfo(element) {
  if (!(element instanceof Element)) return {};

  const testId = element.getAttribute('data-test-id') || element.getAttribute('data-testid') || '';
  const id = element.id || '';
  const role = element.getAttribute('role') || '';
  const ariaLabel = element.getAttribute('aria-label') || '';
  const title = element.getAttribute('title') || '';
  const placeholder = element.getAttribute('placeholder') || '';
  const rect = element.getBoundingClientRect();

  let cssSelector = element.tagName.toLowerCase();
  if (testId) {
    cssSelector = `[data-test-id="${testId.replace(/"/g, '\\"')}"]`;
  } else if (id) {
    cssSelector = `#${escapeCss(id)}`;
  } else if (element.classList.length) {
    cssSelector += '.' + Array.from(element.classList).slice(0, 2).map(escapeCss).join('.');
  }

  const section = getNearestSection(element);

  return {
    tag: element.tagName,
    text: cleanText(element.innerText || element.value || title || ariaLabel || placeholder),
    id,
    data_test_id: testId,
    role,
    aria_label: ariaLabel,
    title,
    placeholder,
    href: element instanceof HTMLAnchorElement ? element.href : '',
    type: element.getAttribute('type') || '',
    name: element.getAttribute('name') || '',
    css_selector: cssSelector,
    xpath: getXPath(element),
    width: Math.round(rect.width),
    height: Math.round(rect.height),
    viewport_visible: rect.bottom >= 0 && rect.right >= 0 && rect.top <= window.innerHeight && rect.left <= window.innerWidth,
    ...section
  };
}
