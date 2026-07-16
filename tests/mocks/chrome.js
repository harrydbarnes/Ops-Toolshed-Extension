// A simple in-memory storage implementation for the mock
const createStorageAreaMock = () => {
  let storage = {};
  return {
    get: jest.fn((keys, callback) => {
      return new Promise(resolve => {
        // Always use setTimeout to ensure compatibility with Jest fake timers
        setTimeout(() => {
          const result = {};
          if (!keys) { // Get all items
              Object.assign(result, storage);
          } else if (Array.isArray(keys)) {
            keys.forEach(key => {
              if (storage[key] !== undefined) {
                result[key] = storage[key];
              }
            });
          } else if (typeof keys === 'object' && keys !== null) {
            Object.keys(keys).forEach(key => {
              result[key] = storage[key] === undefined ? keys[key] : storage[key];
            });
          } else if (typeof keys === 'string') {
            if(storage[keys] !== undefined) {
                result[keys] = storage[keys];
            }
          }
          if (callback) callback(result);
          resolve(result);
        }, 0);
      });
    }),
    set: jest.fn((items, callback) => {
      return new Promise(resolve => {
        setTimeout(() => {
          Object.assign(storage, items);
          if (callback) callback();
          resolve();
        }, 0);
      });
    }),
    remove: jest.fn((keys, callback) => {
      return new Promise(resolve => {
        setTimeout(() => {
          if (Array.isArray(keys)) {
              keys.forEach(key => delete storage[key]);
          } else if (typeof keys === 'string') {
              delete storage[keys];
          }
          if (callback) callback();
          resolve();
        }, 0);
      });
    }),
    clear: jest.fn((callback) => {
      return new Promise(resolve => {
        setTimeout(() => {
          storage = {};
          if (callback) callback();
          resolve();
        }, 0);
      });
    }),
    // Helper to view the storage content in tests
    __getStore: () => storage,
    // Helper to reset the storage before each test
    __resetStore: () => { storage = {}; }
  };
};

const syncStorage = createStorageAreaMock();
const localStorage = createStorageAreaMock();
const sessionStorage = createStorageAreaMock();


global.chrome = {
  runtime: {
    onInstalled: {
      addListener: jest.fn((listener) => {
        global.chrome.runtime.onInstalled.listener = listener;
      }),
      listener: null,
    },
    onMessage: {
      addListener: jest.fn((listener) => {
        // You can store the listener if you need to simulate message events
        global.chrome.runtime.onMessage.listener = listener;
      }),
      listener: null, // to hold the registered listener
    },
    getURL: jest.fn(path => 'mock-url/' + path),
    sendMessage: jest.fn(),
    lastError: undefined,
  },
  storage: {
    sync: syncStorage,
    local: localStorage,
    session: sessionStorage,
    onChanged: {
        addListener: jest.fn()
    }
  },
  alarms: {
    create: jest.fn(),
    clear: jest.fn(),
    onAlarm: {
      addListener: jest.fn(),
    },
  },
  notifications: {
    create: jest.fn(),
    onButtonClicked: {
      addListener: jest.fn(),
    },
    clear: jest.fn(),
  },
  tabs: {
    create: jest.fn(),
    get: jest.fn(),
    query: jest.fn(),
    remove: jest.fn(),
    sendMessage: jest.fn(),
    update: jest.fn(),
    onCreated: {
      addListener: jest.fn(),
    },
    onUpdated: {
      addListener: jest.fn(),
    },
  },
  scripting: {
    executeScript: jest.fn(),
  },
  sidePanel: {
    open: jest.fn(),
    setOptions: jest.fn(),
    close: jest.fn(),
  },
};

// Function to reset mocks before each test
global.resetMocks = () => {
    // Reset all jest.fn() calls
    global.chrome.runtime.onInstalled.addListener.mockClear();
    global.chrome.runtime.onInstalled.listener = null;
    global.chrome.runtime.onMessage.addListener.mockClear();
    global.chrome.runtime.onMessage.listener = null;
    global.chrome.runtime.getURL.mockClear();
    global.chrome.runtime.sendMessage.mockReset();
    global.chrome.alarms.create.mockClear();
    global.chrome.alarms.clear.mockClear();
    global.chrome.alarms.onAlarm.addListener.mockClear();
    global.chrome.notifications.create.mockClear();
    global.chrome.notifications.onButtonClicked.addListener.mockClear();
    global.chrome.notifications.clear.mockClear();
    global.chrome.tabs.create.mockClear();
    global.chrome.tabs.get.mockClear();
    global.chrome.tabs.query.mockClear();
    global.chrome.tabs.remove.mockClear();
    global.chrome.tabs.sendMessage.mockReset();
    global.chrome.tabs.update.mockClear();
    global.chrome.tabs.onCreated.addListener.mockClear();
    global.chrome.tabs.onUpdated.addListener.mockClear();
    global.chrome.scripting.executeScript.mockClear();
    global.chrome.sidePanel.open.mockReset();
    global.chrome.sidePanel.setOptions.mockReset();
    global.chrome.sidePanel.close.mockReset();

    // Reset storage mocks
    global.chrome.storage.sync.get.mockClear();
    global.chrome.storage.sync.set.mockClear();
    global.chrome.storage.sync.remove.mockClear();
    global.chrome.storage.sync.clear.mockClear();
    global.chrome.storage.sync.__resetStore();

    global.chrome.storage.local.get.mockClear();
    global.chrome.storage.local.set.mockClear();
    global.chrome.storage.local.remove.mockClear();
    global.chrome.storage.local.clear.mockClear();
    global.chrome.storage.local.__resetStore();

    global.chrome.storage.session.get.mockClear();
    global.chrome.storage.session.set.mockClear();
    global.chrome.storage.session.remove.mockClear();
    global.chrome.storage.session.clear.mockClear();
    global.chrome.storage.session.__resetStore();

    global.chrome.storage.onChanged.addListener.mockClear();

    // Reset lastError
    global.chrome.runtime.lastError = undefined;
};
