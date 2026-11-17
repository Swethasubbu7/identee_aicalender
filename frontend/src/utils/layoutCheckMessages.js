// Layout check results in plain words (shown on the layout review screen).
// Validation messages in plain words for the summary.
const ROLE_WORDS = {
  NAME_TEXT: "business name",
  TEXT_LINE_1: "text line 1",
  TEXT_LINE_2: "text line 2",
  CALENDAR_AREA: "calendar pad",
  CAKE_MOUNT: "calendar pad",
  GOD_AREA: "god picture area",
  FRAME: "frame",
  SIDE_BOX_LEFT: "left box",
  SIDE_BOX_RIGHT: "right box",
};
export const friendly = (r) => {
  switch (r.code) {
    case "TRIM_SIZE":
      return "The cut shape is slightly off the calendar size — fix it below.";
    case "ARTWORK_RESOLUTION":
      return "The image quality is too low for printing — improve it below.";
    case "ARTWORK_REGION":
      return "The background artwork is mapped to a small element — select the main artwork image (Set up → Background artwork).";
    case "CUTLINE_PRESENT":
      return "The cut shape is missing.";
    case "CUTLINE_ALIGNMENT":
      return "Confirm that the cut outline sits on the design's edge.";
    case "LASER_MATCH":
      return "The cutting file doesn't match the design.";
    case "LASER_CAKE":
      return "The calendar pad in the cutting file doesn't match the design.";
    case "CAKE_MOUNT_SIZE":
      return "The calendar pad isn't the right size for this calendar.";
    case "CAKE_SIZE_CONFIRMED":
      return "The calendar pad size for this calendar isn't confirmed yet.";
    case "TEXT_STYLE":
      return "Choose a font for the text (click it on the review screen).";
    case "REQUIRED_REGION": {
      const role = /Missing (\w+) region/.exec(r.message)?.[1];
      if (role && ROLE_WORDS[role]) return `Select the ${ROLE_WORDS[role]}.`;
      return /artwork/i.test(r.message) ? "Select the background artwork." : r.message;
    }
    default:
      return r.message;
  }
};
