// Usage: npm run seed:formats
// Inserts the confirmed cut type × size × cake catalogue and a default
// production profile whose printer/laser values are all PENDING (null).
// Safe to re-run. Cake sizes that are confirmed in constants/calendar.js are
// (re)applied on every run — this also corrects rows seeded before the
// HEIGHT × WIDTH cake convention was confirmed. Rows whose cake is still
// PENDING in the constants are only inserted, so a cake confirmed later
// through the API (e.g. 30×40) is never overwritten. Production profile
// values are never touched.
const mongoose = require("mongoose");
require("dotenv").config();

const CalendarFormat = require("../models/CalendarFormat");
const ProductionProfile = require("../models/ProductionProfile");
const { CALENDAR_FORMATS, CAKE_STATUS, UNRESOLVED_CAKES } = require("../constants/calendar");

const seed = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);

    const ops = CALENDAR_FORMATS.map((format) => {
      const { cake, ...rest } = format;
      const cakeConfirmed = cake.status === CAKE_STATUS.CONFIRMED;
      // An unresolved cake is (re)set to PENDING even if confirmed earlier.
      const unresolved = Boolean(UNRESOLVED_CAKES[format.cutType]?.[format.sizeCode]);
      return {
        updateOne: {
          filter: { cutType: format.cutType, sizeCode: format.sizeCode },
          update: cakeConfirmed || unresolved
            ? { $setOnInsert: rest, $set: { cake } }
            : { $setOnInsert: format },
          upsert: true,
        },
      };
    });
    const result = await CalendarFormat.bulkWrite(ops);
    console.log(
      `Calendar formats: ${result.upsertedCount} inserted, ` +
        `${result.modifiedCount} cake size(s) corrected, ` +
        `${CALENDAR_FORMATS.length - result.upsertedCount} already present`,
    );

    const existingDefault = await ProductionProfile.findOne({ isDefault: true });
    if (!existingDefault) {
      await ProductionProfile.create({
        name: "Default production profile (values pending)",
        isDefault: true,
      });
      console.log("Default production profile created (all values PENDING)");
    } else {
      console.log("Default production profile already present");
    }
  } catch (error) {
    console.error("Seeding failed:", error.message);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
};

seed();
