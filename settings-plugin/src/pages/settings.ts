import { html, escapeHtml } from "../utils/html";
import { pageShell } from "../utils/shell";
import { SETTINGS_TREE } from "../app/settings-tree";

// Ported from streamline_project/src/settings/settings.html.
//
// Two deliberate differences:
//  - The #scaled-content wrapper is gone: the skin used it for its own scaling,
//    and shell.ts's fit script already scales <body> to the 1920x1200 reference.
//  - The main-category <li> list was hand-written there and duplicated
//    settings-tree.js. It is generated from the tree here, so a category added to
//    the tree appears in the nav without a second edit. The `<id>-btn` ids and the
//    inner <span data-i18n-key> are load-bearing: settings-shell.js looks buttons
//    up by id and reads the span for the search index.
//
// Dropped: #fullscreen-toggle-btn. It toggled the *skin's* fullscreen; inside the
// plugin's iframe that is the host page's business, not this document's.

const NAV_BTN_CLASS =
  "settings-nav-btn w-full text-left px-4 py-3 rounded-lg text-[24px] " +
  "text-[#959595] hover:text-white hover:bg-[#2c4a7a] flex items-center";

function mainCategoryNav(): string {
  return Object.entries(SETTINGS_TREE)
    .map(([id, category]: [string, any], index) => {
      const label = category.i18nKey || category.name;
      return html`<li>
        <button id="${escapeHtml(id)}-btn" class="${NAV_BTN_CLASS}">${index + 1}. <span
            data-i18n-key="${escapeHtml(label)}">${escapeHtml(category.name)}</span></button>
      </li>`;
    })
    .join("\n");
}

export function renderSettingsPage(request: HttpRequest): HttpResponse {
  const content = html`
    <div
      class="bg-base-200 overflow-hidden flex flex-col w-full h-full"
      role="dialog"
      aria-labelledby="page_title"
    >
      <div
        id="subpage-header"
        class="flex justify-between items-center p-6 border-b border-base-300 bg-[var(--box-color)] h-[150px] shrink-0"
      >
        <h1
          id="page_title"
          class="text-[37.5px] font-bold text-[var(--text-primary)] no-select"
          data-i18n-key="Settings"
        >
          Settings
        </h1>
        <div class="flex items-center gap-[22.5px]">
          <button
            id="cancel-settings-btn"
            class="settings-button flex justify-center items-center min-h-0 w-[171px] h-[82.5px] whitespace-nowrap text-[var(--text-primary)] rounded-[67.5px] font-bold text-[24px] uppercase"
            data-i18n-key="Cancel"
            data-fit-text
          >
            CANCEL
          </button>
          <button
            id="save-settings-btn"
            class="flex justify-center items-center bg-[var(--mimoja-blue)] text-white min-h-0 w-[240px] h-[82.5px] whitespace-nowrap font-bold text-[24px] rounded-[67.5px] uppercase"
            data-i18n-key="Save"
            data-fit-text
          >
            SAVE
          </button>
        </div>
      </div>

      ${/* h-[1088px] upstream; the header is 150 and the design reference is 1200,
            so a fixed 1088 overflows by 38px. flex-1 fills exactly what is left. */ ""}
      <div id="settings-body" class="flex flex-1 min-h-0">
        <div
          id="left-panel"
          class="h-full flex flex-col border-r border-base-300 bg-[var(--box-color)]"
          style="width: 796px; flex-shrink: 0;"
        >
          <div class="p-6 border-b border-base-300">
            <div class="relative">
              <input
                type="search"
                enterkeyhint="search"
                id="settings-search"
                placeholder="Search settings..."
                class="w-full p-3 pl-12 rounded-lg border border-[var(--border-color)] bg-[var(--profile-button-background-color)] text-[var(--text-primary)] text-[24px] focus:outline-none focus:ring-2 focus:ring-[var(--mimoja-blue)]"
                aria-label="Search settings"
              />
              <svg
                class="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-[var(--text-primary)]"
                aria-hidden="true"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
            </div>
          </div>

          <div
            class="flex flex-grow overflow-hidden bg-[var(--box-color)]"
            id="settings-navigation-container"
          >
            <div
              id="main-categories-panel"
              class="h-full overflow-y-auto p-2 flex-shrink-0"
              style="width: 405px;"
              aria-label="Settings Categories"
            >
              <nav>
                <ul class="space-y-1">
                  ${mainCategoryNav()}
                </ul>
              </nav>
            </div>
            <div
              id="sub-categories-separator"
              class="cursor-col-resize w-px bg-gray-400 hover:bg-blue-500 h-full"
              aria-hidden="true"
            ></div>
            <div
              id="sub-categories-panel"
              class="h-full overflow-y-auto p-2 flex-1 min-w-0"
              style="background-color: var(--box-color-alt);"
              aria-label="Subcategories"
            >
              <!-- Subcategories are rendered by settings-shell.js -->
            </div>
          </div>
        </div>

        <div
          id="separator"
          class="cursor-col-resize w-px bg-gray-300 hover:bg-blue-500 transition-colors z-10 h-full"
          aria-hidden="true"
        ></div>

        <div
          id="right-panel"
          class="w-[1124px] flex-grow h-full flex flex-col bg-[var(--box-color)] p-6 overflow-y-auto"
          role="main"
          aria-label="Settings Content"
        >
          <div id="settings-content-area" class="flex-grow">
            <div class="flex flex-col items-center justify-center h-full text-center p-8">
              <p class="text-[var(--text-primary)] text-[28px]" aria-live="polite">
                Loading Settings...
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  return {
    requestId: request.requestId,
    status: 200,
    headers: { "Content-Type": "text/html" },
    body: pageShell("Settings", content),
  };
}
