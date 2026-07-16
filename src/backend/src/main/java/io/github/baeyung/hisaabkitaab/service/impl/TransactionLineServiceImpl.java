package io.github.baeyung.hisaabkitaab.service.impl;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import io.github.baeyung.hisaabkitaab.entity.TransactionLine;
import io.github.baeyung.hisaabkitaab.repository.TransactionLineRepository;
import io.github.baeyung.hisaabkitaab.service.TransactionLineService;
import lombok.RequiredArgsConstructor;

import java.util.List;

@Service
@RequiredArgsConstructor
@Transactional
public class TransactionLineServiceImpl implements TransactionLineService
{
    private final TransactionLineRepository transactionLineRepository;

    @Override
    public TransactionLine create(TransactionLine request)
    {
        return transactionLineRepository.save(request);
    }

    @Override
    public List<TransactionLine> upsertAll(List<TransactionLine> request) {
        return transactionLineRepository.saveAll(request);
    }
}
