import { getElementInfo } from './element.js';

export function installFormTracking(api) {
  document.addEventListener('focusin', (event) => {
    const element = event.target?.closest?.('input,select,textarea');
    if (!element) return;
    api.markUserActivity?.(true);
    const info = getElementInfo(element);
    api.emit('FORM_FIELD_FOCUS', {
      action: 'focus',
      element_tag: info.tag || '',
      element_id: info.id || '',
      data_test_id: info.data_test_id || '',
      element_type: info.type || '',
      element_name: info.name || '',
      form_id: element.form?.id || '',
      form_test_id: element.form?.getAttribute('data-test-id') || ''
    });
  }, true);

  document.addEventListener('change', (event) => {
    const element = event.target?.closest?.('input,select,textarea');
    if (!element) return;
    api.markUserActivity?.(true);
    const info = getElementInfo(element);
    const sensitive = ['password', 'hidden'].includes((info.type || '').toLowerCase());
    api.emit('FORM_FIELD_CHANGE', {
      action: 'change',
      element_tag: info.tag || '',
      element_id: info.id || '',
      data_test_id: info.data_test_id || '',
      element_type: info.type || '',
      element_name: info.name || '',
      input_filled: sensitive ? false : Boolean(element.value),
      value_length: sensitive ? 0 : String(element.value || '').length,
      form_id: element.form?.id || '',
      form_test_id: element.form?.getAttribute('data-test-id') || ''
    });
  }, true);

  document.addEventListener('submit', (event) => {
    if (!(event.target instanceof HTMLFormElement)) return;
    api.markUserActivity?.(true);
    const info = getElementInfo(event.target);
    api.emit('FORM_SUBMIT', {
      action: 'submit',
      form_id: event.target.id || '',
      data_test_id: info.data_test_id || '',
      css_selector: info.css_selector || '',
      field_count: event.target.querySelectorAll('input,select,textarea').length
    });
  }, true);
}
