-- Expand the hivecom emote allow-list.
--
-- Categories:
--
--   Reactions  : 👍 👎 🙌 ❤️ 🔥 🎉 👀 💯 💀 ⭐ 🏆
--   Emoticons  : 😂 😢 😭 😳 🤯 😍 😡 🤔 😴 🫠
--   Symbols    : ✅ ❎ 🅰️ 🅱️ 🆒 ⚠️
--   Other      : 💅 🚀 🌡️ 🏳️‍🌈 🗿 🍆 🍑 💦 ☀️ 🌧️ 🌞 🌚 🌿 🌱 🥀
--
-- IMPORTANT: Keep in sync with ALLOWED_HIVECOM_EMOTES in app/lib/reactions.ts.

CREATE OR REPLACE FUNCTION public.get_allowed_hivecom_emotes()
RETURNS text[] AS $$
BEGIN
  RETURN ARRAY[
    -- Reactions
    '👍', '👎', '🙌', '❤️', '🔥', '🎉', '👀', '💯', '💀', '⭐', '🏆',
    -- Emoticons
    '😂', '😢', '😭', '😳', '🤯', '😍', '😡', '🤔', '😴', '🫠',
    -- Symbols
    '✅', '❎', '🅰️', '🅱️', '🆒', '🆗', '⚠️',
    -- Other
    '💅', '🚀', '🏳️‍🌈', '🗿', '🍆', '🍑', '💦', '🌡️', '☀️', '🌧️', '🌞', '🌚', '🌿', '🌱', '🥀'
  ];
END;
$$ LANGUAGE plpgsql IMMUTABLE SECURITY DEFINER;

COMMENT ON FUNCTION public.get_allowed_hivecom_emotes() IS
  'Returns the canonical list of emotes permitted under the "hivecom" reactions provider. '
  'Sync with ALLOWED_HIVECOM_EMOTES in app/lib/reactions.ts.';
