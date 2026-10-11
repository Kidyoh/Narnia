// Progress saved in the browser. Everything is wrapped so private mode or blocked storage still works.
const KEY = 'hillward-save-v1';

const fresh = () => ({ unlocked: 1, stars: [], best: [], muted: false });

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return fresh();
    return { ...fresh(), ...JSON.parse(raw) };
  } catch {
    return fresh();
  }
}

export function save(data) {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    /* storage unavailable: progress lasts for this session only */
  }
}
