package agent

import (
	"fmt"
	"strings"
	"time"
)

const taskPreviewMaxRunes = 280

func previewTaskText(s string) string {
	r := []rune(strings.TrimSpace(s))
	if len(r) <= taskPreviewMaxRunes {
		return string(r)
	}
	return string(r[:taskPreviewMaxRunes]) + "…"
}

func (a *agentImpl) fireStudioProgress(ev StudioProgressEvent) {
	if a.studioProgress == nil || ev.StudioID == "" {
		return
	}
	if ev.EntryID == "" {
		ev.EntryID = fmt.Sprintf("spe_%d", time.Now().UnixNano())
	}
	if ev.Timestamp.IsZero() {
		ev.Timestamp = time.Now()
	}
	a.studioProgress(ev)
}
