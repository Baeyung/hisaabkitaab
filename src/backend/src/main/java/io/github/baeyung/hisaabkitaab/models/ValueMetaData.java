package io.github.baeyung.hisaabkitaab.models;

import lombok.Builder;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
@Builder
public class ValueMetaData
{
    Double cashValue;
    Double bankValue;
    Double billValue;
}
