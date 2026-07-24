package io.github.baeyung.hisaabkitaab.controller;

import io.github.baeyung.hisaabkitaab.dto.event.EventRequest;
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

import java.security.Principal;

@RestController
@RequestMapping("/api/event")
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
            Principal principal
    )
    {
        this.eventService.publishEvent(event, principal.getName());
        return ResponseEntity.ok(event);
    }

    /** An entry rebuilt as a form request, to prefill the entry screen in edit mode. */
    @GetMapping("/{id}")
    public ResponseEntity<EventRequest> getEvent(
            @PathVariable String id,
            Principal principal
    )
    {
        return ResponseEntity.ok(this.eventService.getEvent(id, principal.getName()));
    }

    /** Correct an entry in place; its lines are re-derived from the new values. */
    @PutMapping("/{id}")
    public ResponseEntity<Void> updateEvent(
            @PathVariable String id,
            @Valid @RequestBody EventRequest event,
            Principal principal
    )
    {
        this.eventService.updateEvent(id, event, principal.getName());
        return ResponseEntity.noContent().build();
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteEvent(
            @PathVariable String id,
            Principal principal
    )
    {
        this.eventService.deleteEvent(id, principal.getName());
        return ResponseEntity.noContent().build();
    }
}
