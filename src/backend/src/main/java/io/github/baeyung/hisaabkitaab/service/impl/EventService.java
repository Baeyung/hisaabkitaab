package io.github.baeyung.hisaabkitaab.service.impl;

import io.github.baeyung.hisaabkitaab.dto.event.EventRequest;
import io.github.baeyung.hisaabkitaab.entity.Party;
import io.github.baeyung.hisaabkitaab.entity.Store;
import io.github.baeyung.hisaabkitaab.entity.Transaction;
import io.github.baeyung.hisaabkitaab.enums.TargetKind;
import io.github.baeyung.hisaabkitaab.enums.TransactionEvent;
import io.github.baeyung.hisaabkitaab.exception.ResourceNotFoundException;
import io.github.baeyung.hisaabkitaab.processors.targetkind.KindProcessor;
import io.github.baeyung.hisaabkitaab.processors.transactionevent.EventProcessor;
import io.github.baeyung.hisaabkitaab.service.PartyService;
import io.github.baeyung.hisaabkitaab.service.StoreItemService;
import io.github.baeyung.hisaabkitaab.service.StoreService;
import io.github.baeyung.hisaabkitaab.service.TransactionService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

@Service
public class EventService
{
    private final Map<TransactionEvent, EventProcessor> eventProcessorMap;
    private final Map<TargetKind, KindProcessor> kindProcessorMap;
    private final StoreService storeService;
    private final TransactionService transactionService;
    private final StoreItemService storeItemService;
    private final PartyService partyService;

    @Autowired
    public EventService(
            List<EventProcessor> eventProcessors,
            List<KindProcessor> kindProcessors,
            StoreService storeService,
            TransactionService transactionService,
            StoreItemService storeItemService,
            PartyService partyService
    )
    {
        this.eventProcessorMap = eventProcessors
                .stream()
                .collect(
                        Collectors.toMap(
                                EventProcessor::getTransactionEvent,
                                Function.identity(),
                                (a, b) -> {
                                throw new IllegalStateException(
                                        "Multiple EventProcessors registered for " + a.getTransactionEvent()
                                );
                            }
                        )
                );

        this.kindProcessorMap = kindProcessors
                .stream()
                .collect(
                        Collectors.toMap(
                                KindProcessor::getTargetKind,
                                Function.identity(),
                                (a, b) -> {
                                    throw new IllegalStateException(
                                            "Multiple KindProcessors registered for " + a.getTargetKind()
                                    );
                                }
                        )
                );

        this.storeService = storeService;
        this.transactionService = transactionService;
        this.storeItemService = storeItemService;
        this.partyService = partyService;
    }

    public void publishEvent(EventRequest eventRequest, String ownerIdentifier)
    {
        EventProcessor processor = this.eventProcessorMap.get(eventRequest.getTransactionEvent());

        if (processor != null)
        {
            Store store = storeService.findFirstByOwnerIdentifier(ownerIdentifier);

            if (store == null)
            {
                throw ResourceNotFoundException.forEntity("Store for owner", ownerIdentifier);
            }

            Transaction transaction = transactionService.create(
                    Transaction
                            .builder()
                            .store(store)
                            .event(eventRequest.getTransactionEvent())
                            .party(resolveParty(eventRequest))
                            .bill(eventRequest.getBillNumber())
                            .eventDate(eventRequest.getBillDate())
                            .entryDate(LocalDate.now())
                            .description(eventRequest.getDescription())
                            .build()
            );

            // post to kind processors
            processor.getTargetKinds().forEach((kind, inout) -> {
                KindProcessor kindProcessor = this.kindProcessorMap.get(kind);
                if (kindProcessor != null)
                {
                    kindProcessor.process(
                            eventRequest,
                            inout,
                            processor.getTransactionEvent(),
                            transaction
                    );
                }
                else
                {
                    throw new UnsupportedOperationException("kind not supported: " + kind);
                }
            });
        }
    }

    private Party resolveParty(EventRequest eventRequest)
    {
        EventRequest.Party party = eventRequest.getParty();
        if (party == null || !StringUtils.hasText(party.getPartyId()))
        {
            // create party, if it doesnt exist, with defaults, and user can modify it later
            return null;
        }

        return partyService.findEntity(party.getPartyId());
    }
}
