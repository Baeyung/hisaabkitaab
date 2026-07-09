package io.github.baeyung.hisaabkitaab.service.impl;

import io.github.baeyung.hisaabkitaab.dto.event.EventRequest;
import io.github.baeyung.hisaabkitaab.dto.transaction.TransactionRequest;
import io.github.baeyung.hisaabkitaab.entity.StoreItem;
import io.github.baeyung.hisaabkitaab.entity.Transaction;
import io.github.baeyung.hisaabkitaab.enums.TargetKind;
import io.github.baeyung.hisaabkitaab.enums.TransactionEvent;
import io.github.baeyung.hisaabkitaab.processors.targetkind.KindProcessor;
import io.github.baeyung.hisaabkitaab.processors.transactionevent.EventProcessor;
import io.github.baeyung.hisaabkitaab.service.StoreItemService;
import io.github.baeyung.hisaabkitaab.service.StoreService;
import io.github.baeyung.hisaabkitaab.service.TransactionService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

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

    @Autowired
    public EventService(
            List<EventProcessor> eventProcessors,
            List<KindProcessor> kindProcessors,
            StoreService storeService,
            TransactionService transactionService,
            StoreItemService storeItemService
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
    }

    public void publishEvent(EventRequest eventRequest, String ownerId)
    {
        EventProcessor processor = this.eventProcessorMap.get(eventRequest.getTransactionEvent());

        if (processor != null)
        {
            // create a transaction post it and send aagay
            TransactionRequest transactionRequest = TransactionRequest
                    .builder()
                    .bill(eventRequest.getBillNumber())
                    .description(eventRequest.getDescription())
                    .entryDate(LocalDate.now())
                    .eventDate(eventRequest.getBillDate())
                    .partyId(eventRequest.getPartyId())
                    .storeId(storeService.findFirstByOwnerEmail(ownerId).getId())
                    .build();

            Transaction transaction = transactionService.createEntity(transactionRequest);
            StoreItem item = storeItemService.findEntity(eventRequest.getItem().getItemId());


            // post to kind processors
            processor.getTargetKinds().forEach((kind, inout) -> {
                KindProcessor kindProcessor = this.kindProcessorMap.get(kind);
                if (kindProcessor != null)
                {
                    kindProcessor.process(eventRequest, inout, processor.getTransactionEvent(), transaction, item);
                }
                else
                {
                    throw new UnsupportedOperationException("kind not supported: " + kind);
                }
            });
        }
    }
}
