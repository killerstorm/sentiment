CREATE TABLE messages ( 
  hash TEXT PRIMARY KEY,
  message TEXT NOT NULL
);

CREATE TABLE signatures (
  address TEXT NOT NULL,
  verb TEXT NOT NULL,
  signature TEXT NOT NULL,
  message_hash TEXT REFERENCES messages (hash)
);

CREATE UNIQUE INDEX ON signatures (message_hash, address, verb);
CREATE INDEX ON signatures (address);


CREATE TABLE address_balances (
  address TEXT PRIMARY KEY,
  balance BIGINT NOT NULL,
  last_height INTEGER,
  last_block_hash TEXT
);


CREATE FUNCTION update_address_balance(_address TEXT, _balance BIGINT)
   RETURNS VOID AS
$$
BEGIN
    LOOP
        UPDATE address_balances SET balance = balance WHERE address = _address;
        IF found THEN
            RETURN;
        END IF;
        BEGIN
            INSERT INTO address_balances (address, balance) VALUES (_address, _balance);
            RETURN;
        EXCEPTION WHEN unique_violation THEN
            -- Do nothing, and loop to try the UPDATE again.
        END;
    END LOOP;
END;
$$
LANGUAGE plpgsql;

CREATE VIEW message_scores AS
 SELECT message_hash, verb, SUM(balance) as score
 FROM signatures LEFT JOIN address_balances USING (address)
 GROUP BY message_hash, verb
 ORDER BY SUM(balance);
