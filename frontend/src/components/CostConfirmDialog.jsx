import { useCallback, useRef, useState } from "react";
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Table,
  TableBody,
  TableCell,
  TableRow,
  Typography,
} from "@mui/material";

const inr = (v) => (v == null ? "Unknown" : `₹${Number(v).toFixed(2)}`);

const BASIS_LABEL = {
  MEASURED: "Measured in this app",
  LIST_PRICE_ESTIMATE: "Official price × overhead seen on the Google bill (not yet measured)",
  UNKNOWN: "Unknown",
};

/**
 * Paid AI requests need the designer's explicit OK. The server refuses an AI
 * Generate / Regenerate (409 + estimate) until it is sent again with
 * { confirmCost: true, confirmedEstimateInr }. Preview mode never asks.
 *
 *   const { confirmPaid, dialog } = useCostConfirmation();
 *   const job = await confirmPaid((extra) => startAiCalendarJob({ ...body, ...extra }));
 *   // job === null when the designer cancelled
 */
export const useCostConfirmation = () => {
  const [state, setState] = useState(null); // { estimate, reasons, send, resolve, reject }
  const [busy, setBusy] = useState(false);
  const pending = useRef(false); // no double submission

  const confirmPaid = useCallback(async (send) => {
    try {
      return await send({});
    } catch (err) {
      const data = err.response?.data;
      if (err.response?.status !== 409 || !data?.estimate) throw err;
      return new Promise((resolve, reject) => {
        setState({
          estimate: data.estimate,
          reasons: data.needsConfirmation ? [] : data.reasons || [data.message],
          send,
          resolve,
          reject,
        });
      });
    }
  }, []);

  const cancel = () => {
    state?.resolve(null);
    setState(null);
  };

  const confirm = async () => {
    if (!state || pending.current) return;
    pending.current = true;
    setBusy(true);
    try {
      const result = await state.send({ confirmCost: true, confirmedEstimateInr: state.estimate.totalInr });
      state.resolve(result);
      setState(null);
    } catch (err) {
      const data = err.response?.data;
      if (err.response?.status === 409 && data?.estimate) {
        // The estimate changed or a limit was hit meanwhile: show it again.
        setState({ ...state, estimate: data.estimate, reasons: data.needsConfirmation ? [] : data.reasons || [data.message] });
      } else {
        state.reject(err);
        setState(null);
      }
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };

  const e = state?.estimate;
  const blocked = Boolean(state?.reasons?.length) || e?.totalInr == null;
  const dialog = (
    <Dialog open={Boolean(state)} onClose={busy ? undefined : cancel} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ fontWeight: 700 }}>{blocked ? "AI generation is not allowed now" : "Confirm AI cost"}</DialogTitle>
      <DialogContent>
        {e && (
          <Table size="small" sx={{ mb: 1.5 }}>
            <TableBody>
              <TableRow>
                <TableCell>Paid image requests</TableCell>
                <TableCell align="right">{e.requests}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell>Per request (incl. GST)</TableCell>
                <TableCell align="right">{inr(e.perRequestInr)}</TableCell>
              </TableRow>
              {e.totalUsd != null && (
                <TableRow>
                  <TableCell>Estimated in USD (before GST)</TableCell>
                  <TableCell align="right">${e.totalUsd.toFixed(4)}</TableCell>
                </TableRow>
              )}
              {e.totalInrBeforeGst != null && (
                <TableRow>
                  <TableCell>In INR before GST (₹{e.inrPerUsd}/USD)</TableCell>
                  <TableCell align="right">{inr(e.totalInrBeforeGst)}</TableCell>
                </TableRow>
              )}
              {e.totalGstInr != null && (
                <TableRow>
                  <TableCell>GST ({Math.round((e.gstRate || 0) * 100)}%)</TableCell>
                  <TableCell align="right">{inr(e.totalGstInr)}</TableCell>
                </TableRow>
              )}
              <TableRow>
                <TableCell sx={{ fontWeight: 700 }}>Estimated total (incl. GST)</TableCell>
                <TableCell align="right" sx={{ fontWeight: 700 }}>{inr(e.totalInr)}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell>Model</TableCell>
                <TableCell align="right">{e.model} · {e.resolution}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        )}
        <Typography variant="caption" component="p" sx={{ color: "#7A7266", mb: 1 }}>
          Basis: {BASIS_LABEL[e?.status] || e?.status}. {e?.basis}
        </Typography>
        {state?.reasons?.map((r) => (
          <Alert key={r} severity="error" sx={{ mb: 1 }}>{r}</Alert>
        ))}
        <Alert severity="info" sx={{ mt: 1 }}>
          This is the app's estimate. Google bills the real amount — check your balance in Google AI Studio → Billing.
        </Alert>
      </DialogContent>
      <DialogActions>
        <Button onClick={cancel} disabled={busy}>{blocked ? "Close" : "Cancel"}</Button>
        {!blocked && (
          <Button variant="contained" onClick={confirm} disabled={busy}>
            {busy ? "Starting…" : `Generate for about ${inr(e?.totalInr)}`}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );

  return { confirmPaid, dialog };
};
