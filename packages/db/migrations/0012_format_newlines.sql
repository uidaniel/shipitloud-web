-- The seed's example text used a literal backslash-n for line breaks; store real newlines.
update viral_formats
set example = replace(example, E'\\n', E'\n'), structure = replace(structure, E'\\n', E'\n')
where position(E'\\n' in example) > 0 or position(E'\\n' in structure) > 0;
