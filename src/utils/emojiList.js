// A curated, common-use subset rather than a full emoji library — this
// covers the overwhelming majority of what actually gets used in
// workplace chat, without pulling in a large dependency (or an external
// API call) just to render a picker grid.
export const EMOJI_GROUPS = [
  {
    label: 'Smileys',
    emojis: ['😀', '😃', '😄', '😁', '😅', '🙂', '😉', '😊', '😇', '🙃', '😌', '😍', '🤩', '😘', '😎', '🤓', '🧐', '😴', '🥳', '😅']
  },
  {
    label: 'Reactions',
    emojis: ['👍', '👎', '👏', '🙌', '🙏', '💪', '👌', '✌️', '🤞', '🤝', '👋', '🤔', '😅', '😬', '😳', '😢', '😭', '😡', '😱', '🥲']
  },
  {
    label: 'Work',
    emojis: ['✅', '❌', '⚠️', '📌', '📎', '📝', '📄', '📁', '📅', '⏰', '🔔', '🔍', '💡', '🚩', '🎯', '🔥', '✨', '🎉', '👀', '📢']
  },
  {
    label: 'Hearts',
    emojis: ['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '💯', '⭐']
  }
];