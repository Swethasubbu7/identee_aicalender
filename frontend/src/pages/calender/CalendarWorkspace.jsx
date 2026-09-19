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

const CalendarWorkspace = forwardRef(
  (
    { layout, onSelectImage, onLayersChange, onZoomChange, onHistoryChange },
    ref,
  ) => {
    const containerRef = useRef(null);
    const canvasElRef = useRef(null);
    const fabricRef = useRef(null);
    const areaRef = useRef(null);
    const [loading, setLoading] = useState(true);

    const historyRef = useRef([]);
    const redoRef = useRef([]);
    const suppressHistoryRef = useRef(false);
    const panModeRef = useRef(false);
    const isPanningRef = useRef(false);

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

    const emitLayers = () => {
      const canvas = fabricRef.current;
      if (!canvas) return;
      const customerImage = canvas.getObjects().find((o) => o.isCustomerImage);
      onLayersChange?.({
        hasCustomerImage: Boolean(customerImage),
        customerImageVisible: customerImage
          ? customerImage.visible !== false
          : true,
      });
    };

    const emitHistory = () => {
      onHistoryChange?.({
        canUndo: historyRef.current.length > 1,
        canRedo: redoRef.current.length > 0,
      });
    };

    const emitZoom = () => {
      const canvas = fabricRef.current;
      if (!canvas) return;
      onZoomChange?.(Math.round(canvas.getZoom() * 100));
    };

    const pushHistory = () => {
      const canvas = fabricRef.current;
      if (!canvas || suppressHistoryRef.current) return;
      const snapshot = JSON.stringify(
        canvas.toJSON(["guide", "isCustomerImage", "selectable", "evented"]),
      );
      historyRef.current.push(snapshot);
      if (historyRef.current.length > 30) historyRef.current.shift();
      redoRef.current = [];
      emitHistory();
    };

    const loadSnapshot = (snapshot) => {
      const canvas = fabricRef.current;
      if (!canvas || !snapshot) return;
      suppressHistoryRef.current = true;
      canvas.loadFromJSON(JSON.parse(snapshot), () => {
        canvas.getObjects().forEach((obj) => {
          if (obj.guide) {
            canvas.areaGuide = obj;
          }
        });
        canvas.renderAll();
        suppressHistoryRef.current = false;
        emitLayers();
        emitHistory();
        onSelectImage(canvas.getActiveObject() || null);
      });
    };

    useImperativeHandle(ref, () => ({
      addImageFromFile: (file) => {
        const canvas = fabricRef.current;
        const areaAbs = getAreaAbsolute();
        if (!canvas || !areaAbs) return;

        const reader = new FileReader();
        reader.onload = (e) => {
          fabric.FabricImage.fromURL(e.target.result).then((img) => {
            const existing = canvas.getObjects().find((o) => o.isCustomerImage);
            if (existing) canvas.remove(existing);

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
              isCustomerImage: true,
            });
            canvas.add(img);
            canvas.setActiveObject(img);
            canvas.renderAll();
            onSelectImage(img);
            emitLayers();
            pushHistory();
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
        pushHistory();
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
        pushHistory();
      },
      updateTransform: (props) => {
        const canvas = fabricRef.current;
        const active = canvas?.getActiveObject();
        if (!active) return;
        active.set(props);
        active.setCoords();
        canvas.renderAll();
        pushHistory();
      },
      applyFilter: (type) => {
        const canvas = fabricRef.current;
        const active = canvas?.getActiveObject();
        if (!active || active.type !== "image") return;

        if (type === "original") {
          active.filters = [];
        } else if (type === "brightness") {
          active.filters = [
            new fabric.filters.Brightness({ brightness: 0.15 }),
          ];
        } else if (type === "contrast") {
          active.filters = [new fabric.filters.Contrast({ contrast: 0.2 })];
        } else if (type === "saturation") {
          active.filters = [
            new fabric.filters.Saturation({ saturation: 0.35 }),
          ];
        }
        active.applyFilters();
        canvas.renderAll();
        pushHistory();
      },
      exportJSON: () => fabricRef.current?.toJSON(),
      undo: () => {
        if (historyRef.current.length <= 1) return;
        const current = historyRef.current.pop();
        redoRef.current.push(current);
        loadSnapshot(historyRef.current[historyRef.current.length - 1]);
      },
      redo: () => {
        if (redoRef.current.length === 0) return;
        const snapshot = redoRef.current.pop();
        historyRef.current.push(snapshot);
        loadSnapshot(snapshot);
      },
      zoomIn: () => {
        const canvas = fabricRef.current;
        if (!canvas) return;
        const newZoom = Math.min(canvas.getZoom() + 0.1, 3);
        canvas.setZoom(newZoom);
        emitZoom();
      },
      zoomOut: () => {
        const canvas = fabricRef.current;
        if (!canvas) return;
        const newZoom = Math.max(canvas.getZoom() - 0.1, 0.3);
        canvas.setZoom(newZoom);
        emitZoom();
      },
      resetZoom: () => {
        const canvas = fabricRef.current;
        if (!canvas) return;
        canvas.setZoom(1);
        canvas.absolutePan({ x: 0, y: 0 });
        emitZoom();
      },
      togglePan: () => {
        panModeRef.current = !panModeRef.current;
        const canvas = fabricRef.current;
        if (canvas) {
          canvas.selection = !panModeRef.current;
          canvas.defaultCursor = panModeRef.current ? "grab" : "default";
        }
        return panModeRef.current;
      },
      toggleFullscreen: () => {
        const el = containerRef.current;
        if (!el) return;
        if (!document.fullscreenElement) {
          el.requestFullscreen?.();
        } else {
          document.exitFullscreen?.();
        }
      },
      removeCustomerImage: () => {
        const canvas = fabricRef.current;
        const target = canvas?.getObjects().find((o) => o.isCustomerImage);
        if (!target) return;
        canvas.remove(target);
        canvas.renderAll();
        onSelectImage(null);
        emitLayers();
        pushHistory();
      },
      duplicateCustomerImage: () => {
        const canvas = fabricRef.current;
        const target = canvas?.getObjects().find((o) => o.isCustomerImage);
        if (!target) return;
        target.clone().then((cloned) => {
          cloned.set({
            left: target.left + 20,
            top: target.top + 20,
            isCustomerImage: false,
          });
          canvas.add(cloned);
          canvas.setActiveObject(cloned);
          canvas.renderAll();
          pushHistory();
        });
      },
      toggleCustomerImageVisibility: () => {
        const canvas = fabricRef.current;
        const target = canvas?.getObjects().find((o) => o.isCustomerImage);
        if (!target) return;
        target.visible = target.visible === false ? true : false;
        canvas.renderAll();
        emitLayers();
      },
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
      historyRef.current = [];
      redoRef.current = [];

      canvas.on("selection:created", (e) =>
        onSelectImage(e.selected?.[0] || null),
      );
      canvas.on("selection:updated", (e) =>
        onSelectImage(e.selected?.[0] || null),
      );
      canvas.on("selection:cleared", () => onSelectImage(null));
      canvas.on("object:modified", () => {
        onSelectImage(canvas.getActiveObject() || null);
        pushHistory();
      });

      canvas.on("mouse:down", (opt) => {
        if (!panModeRef.current) return;
        isPanningRef.current = true;
        canvas.defaultCursor = "grabbing";
        canvas.lastPosX = opt.e.clientX;
        canvas.lastPosY = opt.e.clientY;
      });
      canvas.on("mouse:move", (opt) => {
        if (!isPanningRef.current) return;
        const vpt = canvas.viewportTransform;
        vpt[4] += opt.e.clientX - canvas.lastPosX;
        vpt[5] += opt.e.clientY - canvas.lastPosY;
        canvas.requestRenderAll();
        canvas.lastPosX = opt.e.clientX;
        canvas.lastPosY = opt.e.clientY;
      });
      canvas.on("mouse:up", () => {
        isPanningRef.current = false;
        canvas.defaultCursor = panModeRef.current ? "grab" : "default";
      });

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
            guide: true,
          });
          canvas.add(guide);
          canvas.areaGuide = guide;
        }

        canvas.renderAll();
        setLoading(false);
        pushHistory();
        emitZoom();
        emitLayers();
      });

      return () => canvas.dispose();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [layout]);

    return (
      <Box
        ref={containerRef}
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
  },
);

export default CalendarWorkspace;
