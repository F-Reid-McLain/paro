let _push = null

export function _initToast(setToasts) {
  _push = (t) => {
    setToasts((prev) => [...prev, t])
    setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== t.id)), 3500)
  }
}

export function toast(message, type = 'error') {
  if (!_push) return
  _push({ message, type, id: Date.now() + Math.random() })
}
