// Browser-environment suites already have a real document and window.
if (!global.document) {
  global.document = {
    addEventListener: jest.fn(),
    getElementById: jest.fn(id => ({
      addEventListener: jest.fn(),
      value: '',
    })),
    createElement: jest.fn(tag => {
      const element = {
        appendChild: jest.fn(),
        innerHTML: '',
      };
      if (tag === 'div') {
        element.appendChild = jest.fn(node => {
          if (node.nodeValue) {
            element.innerHTML = node.nodeValue
              .replace(/&/g, '&amp;')
              .replace(/</g, '&lt;')
              .replace(/>/g, '&gt;')
          }
        });
      }
      return element;
    }),
    createTextNode: jest.fn(text => ({
      nodeValue: text,
    })),
  };

  global.window = {
    addEventListener: jest.fn(),
  };
}

global.alert = jest.fn();
