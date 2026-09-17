import React, {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { Box, CircularProgress } from "@mui/material";
import * as fabric from "fabric";

const buildClipPath = (shape, width, height) => {
  switch (shape) {
    case "circle": {
      const r = Math.min(width, height) / 2;
      return new fabric.Circle({
        radius: r,
        originX: "center",
        originY: "center",
      });
    }
    case "arch": {
      const w = width;
      const h = height;
      const r = w / 2;
      const pathStr = `
        M ${-w / 2} ${h / 2}
        L ${-w / 2} ${-h / 2 + r}
        A ${r} ${r} 0 0 1 ${w / 2} ${-h / 2 + r}
        L ${w / 2} ${h / 2}
        Z
      `;
      return new fabric.Path(pathStr, { originX: "center", originY: "center" });
    }
    case "rectangle":
    default:
      return new fabric.Rect({
        width,
        height,
        originX: "center",
        originY: "center",
      });
  }
};

const CalendarWorkspace = forwardRef(({ layout, onSelectImage }, ref) => {
  const canvasElRef = useRef(null);
  const fabricRef = useRef(null);
  const areaRef = useRef(null);
  const [loading, setLoading] = useState(true);

  const getAreaAbsolute = () => {
    const area = areaRef.current;
    const canvas = fabricRef.current;
    if (!area || !canvas?.areaGuide) return null;
    const guide = canvas.areaGuide;
    return {
      left: guide.left,
      top: guide.top,
      width: area.width * area.canvasScale,
      height: area.height * area.canvasScale,
      shape: area.shape,
    };
  };

  useImperativeHandle(ref, () => ({
    addImageFromFile: (file) => {
      const canvas = fabricRef.current;
      const areaAbs = getAreaAbsolute();
      if (!canvas || !areaAbs) return;

      const reader = new FileReader();
      reader.onload = (e) => {
        fabric.FabricImage.fromURL(e.target.result).then((img) => {
          const clip = buildClipPath(
            areaAbs.shape,
            areaAbs.width,
            areaAbs.height,
          );
          const scale = Math.max(
            areaAbs.width / img.width,
            areaAbs.height / img.height,
          );
          img.set({
            left: areaAbs.left,
            top: areaAbs.top,
            originX: "center",
            originY: "center",
            scaleX: scale,
            scaleY: scale,
            clipPath: clip,
          });
          canvas.add(img);
          canvas.setActiveObject(img);
          canvas.renderAll();
          onSelectImage(img);
        });
      };
      reader.readAsDataURL(file);
    },
    fitToArea: () => {
      const canvas = fabricRef.current;
      const active = canvas?.getActiveObject();
      const areaAbs = getAreaAbsolute();
      if (!active || !areaAbs) return;
      const scale = Math.max(
        areaAbs.width / active.width,
        areaAbs.height / active.height,
      );
      active.set({
        left: areaAbs.left,
        top: areaAbs.top,
        scaleX: scale,
        scaleY: scale,
        angle: 0,
      });
      canvas.renderAll();
    },
    resetImage: () => {
      const canvas = fabricRef.current;
      const active = canvas?.getActiveObject();
      const areaAbs = getAreaAbsolute();
      if (!active || !areaAbs) return;
      const scale = Math.max(
        areaAbs.width / active.width,
        areaAbs.height / active.height,
      );
      active.set({
        left: areaAbs.left,
        top: areaAbs.top,
        scaleX: scale,
        scaleY: scale,
        angle: 0,
      });
      canvas.renderAll();
    },
    updateTransform: (props) => {
      const canvas = fabricRef.current;
      const active = canvas?.getActiveObject();
      if (!active) return;
      active.set(props);
      active.setCoords();
      canvas.renderAll();
    },
    exportJSON: () => fabricRef.current?.toJSON(),
  }));

  useEffect(() => {
    if (!layout) return;

    const canvas = new fabric.Canvas(canvasElRef.current, {
      width: 500,
      height: 650,
      backgroundColor: "#f4f1ea",
      preserveObjectStacking: true,
    });
    fabricRef.current = canvas;

    canvas.on("selection:created", (e) =>
      onSelectImage(e.selected?.[0] || null),
    );
    canvas.on("selection:updated", (e) =>
      onSelectImage(e.selected?.[0] || null),
    );
    canvas.on("selection:cleared", () => onSelectImage(null));
    canvas.on("object:modified", () =>
      onSelectImage(canvas.getActiveObject() || null),
    );

    setLoading(true);

    fabric.FabricImage.fromURL(
      layout.previewImage || "https://placehold.co/500x650?text=No+Preview",
      { crossOrigin: "anonymous" },
    ).then((img) => {
      const scale = Math.min(
        canvas.width / img.width,
        canvas.height / img.height,
      );
      img.set({
        left: canvas.width / 2,
        top: canvas.height / 2,
        originX: "center",
        originY: "center",
        scaleX: scale,
        scaleY: scale,
        selectable: false,
        evented: false,
        hoverCursor: "default",
      });
      canvas.add(img);
      canvas.sendObjectToBack
        ? canvas.sendObjectToBack(img)
        : canvas.sendToBack(img);

      const area = layout.editableAreas?.[0];
      if (area) {
        areaRef.current = { ...area, canvasScale: scale };
        const guide = buildClipPath(
          area.shape,
          area.width * scale,
          area.height * scale,
        );
        guide.set({
          left:
            img.left -
            (img.width * scale) / 2 +
            (area.x + area.width / 2) * scale,
          top:
            img.top -
            (img.height * scale) / 2 +
            (area.y + area.height / 2) * scale,
          fill: "transparent",
          stroke: "#B08D35",
          strokeDashArray: [6, 4],
          strokeWidth: 2,
          selectable: false,
          evented: false,
        });
        canvas.add(guide);
        canvas.areaGuide = guide;
      }

      canvas.renderAll();
      setLoading(false);
    });

    return () => canvas.dispose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout]);

  return (
    <Box
      sx={{
        position: "relative",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        background: "#EDE7D9",
        borderRadius: 2,
        p: 3,
        minHeight: 650,
      }}
    >
      {loading && (
        <Box sx={{ position: "absolute" }}>
          <CircularProgress sx={{ color: "#B08D35" }} />
        </Box>
      )}
      <canvas ref={canvasElRef} />
    </Box>
  );
});

export default CalendarWorkspace;
