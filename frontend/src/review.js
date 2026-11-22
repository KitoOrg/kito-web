// A review being written (Kito 0.38): its comments wait in this browser
// until the review is sent, with its verdict, in one go. What was marked
// as viewed is kept here too, with what the file had then.

const place = () => `${location.host}${location.pathname}${new URLSearchParams(location.search).get('repo') ?? ''}`;

function read(key, empty) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? empty;
  } catch {
    return empty;
  }
}

function write(key, value) {
  try {
    if (value === null || (Array.isArray(value) && value.length === 0)) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // A browser that keeps nothing: the draft lives as long as the page.
  }
}

const draftKey = (lane) => `kito-review:${place()}:${lane}`;
export const loadDrafts = (lane) => read(draftKey(lane), []);
export const saveDrafts = (lane, drafts) => write(draftKey(lane), drafts);

// Viewed: the file's content when it was marked. Another content is not viewed.
const viewedKey = (lane, path) => `kito-viewed:${place()}:${lane}:${path}`;
export const viewedAs = (lane, path) => read(viewedKey(lane, path), null);
export const markViewed = (lane, path, content) => write(viewedKey(lane, path), content);
