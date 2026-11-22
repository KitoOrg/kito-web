// Where the documentation explains each page of the client. A page says
// little itself, and points there.
const PAGES = 'https://kito.sh/plugins/web/';

/** The address of what the documentation says of a page: `lanes`, `a-lane`, `tasks`. */
export const docsLink = (part) => `${PAGES}#${part}`;
