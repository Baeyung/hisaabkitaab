package io.github.baeyung.hisaabkitaab.controller;

import io.github.baeyung.hisaabkitaab.dto.event.EventRequest;
import io.github.baeyung.hisaabkitaab.service.impl.EventService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

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
    public ResponseEntity<?> publishEvent(EventRequest event, SecurityContext securityContext)
    {
        this.eventService.publishEvent(event, securityContext.getAuthentication().getName());
        return ResponseEntity.ok(event);
    }
}
