package io.github.baeyung.hisaabkitaab.controller;

import io.github.baeyung.hisaabkitaab.dto.event.EventRequest;
import io.github.baeyung.hisaabkitaab.entity.Store;
import io.github.baeyung.hisaabkitaab.security.CurrentStore;
import io.github.baeyung.hisaabkitaab.service.impl.EventService;
import jakarta.validation.Valid;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/stores/{storeId}/event")
public class EventController
{
    private final EventService eventService;

    @Autowired
    EventController(EventService eventService)
    {
        this.eventService = eventService;
    }

    @PostMapping
    public ResponseEntity<EventRequest> publishEvent(
            @Valid @RequestBody EventRequest event,
            @CurrentStore Store store
    )
    {
        this.eventService.publishEvent(event, store);
        return ResponseEntity.ok(event);
    }

    /** An entry rebuilt as a form request, to prefill the entry screen in edit mode. */
    @GetMapping("/{id}")
    public ResponseEntity<EventRequest> getEvent(
            @PathVariable String id,
            @CurrentStore Store store
    )
    {
        return ResponseEntity.ok(this.eventService.getEvent(id, store));
    }

    /** Correct an entry in place; its lines are re-derived from the new values. */
    @PutMapping("/{id}")
    public ResponseEntity<Void> updateEvent(
            @PathVariable String id,
            @Valid @RequestBody EventRequest event,
            @CurrentStore Store store
    )
    {
        this.eventService.updateEvent(id, event, store);
        return ResponseEntity.noContent().build();
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteEvent(
            @PathVariable String id,
            @CurrentStore Store store
    )
    {
        this.eventService.deleteEvent(id, store);
        return ResponseEntity.noContent().build();
    }
}
