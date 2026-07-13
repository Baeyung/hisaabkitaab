package io.github.baeyung.hisaabkitaab.controller;

import io.github.baeyung.hisaabkitaab.dto.event.EventRequest;
import io.github.baeyung.hisaabkitaab.service.impl.EventService;
import jakarta.validation.Valid;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
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
    public ResponseEntity<?> publishEvent(@Valid @RequestBody EventRequest event, Principal principal)
    {
        this.eventService.publishEvent(event, principal.getName());
        return ResponseEntity.ok(event);
    }
}
