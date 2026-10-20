afterEach(() => {
    for (const dom of globalThis.__activeTestDoms || []) dom.window.close();
});
