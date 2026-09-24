/**
 * Keep visually in sync with the Supabase auth templates beside it. The admin
 * preview and the send both render this, so the output has to match byte for byte.
 * Shared by Deno and the browser, so no imports, Deno globals or DOM globals.
 */

export const BROADCAST_LOGO_URL
  = 'https://hivecom.supabase.co/storage/v1/object/public/hivecom-content-static/emails/logo.png'

export const BROADCAST_SITE_URL = 'https://hivecom.net'

export const BROADCAST_GREEN = '#a5fc32'

/** Matches the sibling templates' long inline links */
export const BROADCAST_LINK_GREEN = '#7da360'

export const BROADCAST_CONTENT_CLASS = 'broadcast-content'

const FONT_STACK = '\'Segoe UI\', Arial, sans-serif'
const MONO_STACK = '\'Roboto Mono\', \'Menlo\', \'Consolas\', monospace'

const AMP_RE = /&/g
const LT_RE = /</g
const GT_RE = />/g
const QUOT_RE = /"/g

function escapeHtml(value: string): string {
  return value
    .replace(AMP_RE, '&amp;')
    .replace(LT_RE, '&lt;')
    .replace(GT_RE, '&gt;')
    .replace(QUOT_RE, '&quot;')
}

// contentHtml goes in unescaped. It's trusted because only admins compose
// broadcasts. The subject is escaped.
export function renderBroadcastEmail(
  subject: string,
  contentHtml: string,
  options?: { centered?: boolean },
): string {
  const safeSubject = escapeHtml(subject.trim())
  const align = (options?.centered ?? true) ? 'center' : 'left'

  return `<!doctype html>
<html>
  <head>
    <meta charset="UTF-8" />
    <title>${safeSubject}</title>
    <style>
      body {
        margin: 0;
        padding: 0;
        background: #0e0e0e;
        color: #fff;
        font-family: ${FONT_STACK};
      }
      .${BROADCAST_CONTENT_CLASS} {
        color: #fff;
        font-family: ${FONT_STACK};
        font-size: 15px;
        line-height: 1.6;
        text-align: ${align};
      }
      .${BROADCAST_CONTENT_CLASS} p {
        margin: 0 0 16px 0;
      }
      .${BROADCAST_CONTENT_CLASS} h1,
      .${BROADCAST_CONTENT_CLASS} h2,
      .${BROADCAST_CONTENT_CLASS} h3 {
        color: #fff;
        font-weight: bold;
        line-height: 1.3;
        margin: 28px 0 12px 0;
      }
      .${BROADCAST_CONTENT_CLASS} h1 {
        font-size: 22px;
      }
      .${BROADCAST_CONTENT_CLASS} h2 {
        font-size: 18px;
      }
      .${BROADCAST_CONTENT_CLASS} h3 {
        font-size: 16px;
      }
      .${BROADCAST_CONTENT_CLASS} ul,
      .${BROADCAST_CONTENT_CLASS} ol {
        margin: 0 0 16px 0;
        padding-left: 22px;
      }
      .${BROADCAST_CONTENT_CLASS} li {
        margin: 0 0 8px 0;
      }
      .${BROADCAST_CONTENT_CLASS} a {
        color: ${BROADCAST_LINK_GREEN};
        text-decoration: underline;
        word-break: break-word;
      }
      .${BROADCAST_CONTENT_CLASS} strong,
      .${BROADCAST_CONTENT_CLASS} b {
        color: #fff;
        font-weight: bold;
      }
      .${BROADCAST_CONTENT_CLASS} blockquote {
        margin: 0 0 16px 0;
        padding: 4px 0 4px 14px;
        border-left: 3px solid ${BROADCAST_GREEN};
        color: #ccc;
      }
      .${BROADCAST_CONTENT_CLASS} code {
        background: #222;
        color: ${BROADCAST_GREEN};
        font-family: ${MONO_STACK};
        font-size: 13px;
        padding: 2px 5px;
        border-radius: 4px;
      }
      .${BROADCAST_CONTENT_CLASS} pre {
        background: #222;
        color: #fff;
        font-family: ${MONO_STACK};
        font-size: 13px;
        padding: 14px;
        border-radius: 6px;
        margin: 0 0 16px 0;
        overflow-x: auto;
        white-space: pre-wrap;
        word-break: break-word;
      }
      .${BROADCAST_CONTENT_CLASS} pre code {
        background: transparent;
        color: #fff;
        padding: 0;
      }
      .${BROADCAST_CONTENT_CLASS} hr {
        border: 0;
        border-top: 1px solid #333;
        margin: 24px 0;
      }
      .${BROADCAST_CONTENT_CLASS} img {
        max-width: 100%;
        height: auto;
        display: block;
        border: 0;
      }
      .${BROADCAST_CONTENT_CLASS} table {
        width: 100%;
        border-collapse: collapse;
        margin: 0 0 16px 0;
      }
      .${BROADCAST_CONTENT_CLASS} th,
      .${BROADCAST_CONTENT_CLASS} td {
        border: 1px solid #333;
        padding: 8px;
        text-align: left;
      }
    </style>
  </head>
  <body style="margin: 0; padding: 0; background: #0e0e0e; color: #fff; font-family: ${FONT_STACK}">
    <table
      role="presentation"
      width="100%"
      cellpadding="0"
      cellspacing="0"
      style="width: 100%; border-collapse: collapse; background: #0e0e0e"
    >
      <tr>
        <td align="center" style="padding: 40px 0">
          <table
            role="presentation"
            width="480"
            cellpadding="0"
            cellspacing="0"
            style="
              width: 100%;
              max-width: 480px;
              background: #181818;
              border-radius: 16px;
              box-shadow: 0 2px 12px rgba(0, 0, 0, 0.6);
              text-align: center;
            "
          >
            <tr>
              <td style="padding: 36px 32px 28px 32px">
                <a
                  href="${BROADCAST_SITE_URL}"
                  style="display: inline-block; margin: 0 auto 24px auto; text-decoration: none"
                >
                  <img
                    src="${BROADCAST_LOGO_URL}"
                    alt="Hivecom"
                    width="200"
                    height="48"
                    style="display: block; width: 200px; height: 48px; margin: 0 auto 10px auto; border: 0"
                  />
                </a>
                <div
                  class="${BROADCAST_CONTENT_CLASS}"
                  style="color: #fff; font-family: ${FONT_STACK}; font-size: 15px; line-height: 1.6; text-align: ${align}"
                >
                  <h1 style="color: #fff; font-size: 22px; font-weight: bold; line-height: 1.3; margin: 0 0 20px 0">
                    ${safeSubject}
                  </h1>
                  ${contentHtml}
                </div>
                <div style="color: #888; font-size: 12px; margin-top: 32px; text-align: center">
                  &copy; 2013-${new Date().getFullYear()} Hivecom
                </div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
`
}
